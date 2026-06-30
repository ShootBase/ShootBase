
-- 1. Schema additions
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS service_radius_miles integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS nationwide_service boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remote_service boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS service_area_updated_at timestamptz;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS remote_ok boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS professionals_geo_idx
  ON public.professionals (latitude, longitude)
  WHERE status = 'active';

-- 2. Distance helper (haversine, miles)
CREATE OR REPLACE FUNCTION public.miles_between(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) RETURNS double precision
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN NULL
    ELSE 3958.8 * 2 * asin(sqrt(
      power(sin(radians((lat2 - lat1) / 2)), 2)
      + cos(radians(lat1)) * cos(radians(lat2))
        * power(sin(radians((lon2 - lon1) / 2)), 2)
    ))
  END;
$$;

-- 3. Predicate helper
CREATE OR REPLACE FUNCTION public.pro_covers_job(
  _pro_lat double precision, _pro_lng double precision,
  _pro_radius_miles integer, _pro_nationwide boolean, _pro_remote boolean,
  _job_lat double precision, _job_lng double precision, _job_remote_ok boolean
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(_pro_nationwide, false)
    OR (COALESCE(_job_remote_ok, false) AND COALESCE(_pro_remote, false))
    OR (
      _pro_lat IS NOT NULL AND _pro_lng IS NOT NULL
      AND _job_lat IS NOT NULL AND _job_lng IS NOT NULL
      AND public.miles_between(_pro_lat, _pro_lng, _job_lat, _job_lng)
          <= COALESCE(_pro_radius_miles, 25)
    );
$$;

-- 4. Rewrite tg_match_pros_on_new_job
CREATE OR REPLACE FUNCTION public.tg_match_pros_on_new_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pro RECORD; _count INTEGER := 0; _max INTEGER := 5;
  _pref public.lead_email_mode; _inapp BOOLEAN;
  _email TEXT; _suppressed BOOLEAN; _email_status TEXT;
BEGIN
  IF NEW.status <> 'open' OR NEW.service_id IS NULL THEN RETURN NEW; END IF;

  RAISE NOTICE '[lead-match] job=% service=% city=% lat=% lng=% remote_ok=%',
    NEW.id, NEW.service_id, NEW.city, NEW.latitude, NEW.longitude, NEW.remote_ok;

  FOR _pro IN
    SELECT DISTINCT pr.id, pr.user_id, pr.rating_avg
    FROM public.professional_services ps
    JOIN public.professionals pr ON pr.id = ps.professional_id
    WHERE ps.service_id = NEW.service_id
      AND pr.status = 'active'
      AND public.pro_covers_job(
        pr.latitude, pr.longitude, pr.service_radius_miles,
        pr.nationwide_service, pr.remote_service,
        NEW.latitude, NEW.longitude, NEW.remote_ok
      )
    ORDER BY pr.rating_avg DESC NULLS LAST
    LIMIT _max
  LOOP
    INSERT INTO public.lead_matches (job_id, professional_id)
      VALUES (NEW.id, _pro.id) ON CONFLICT DO NOTHING;

    SELECT lead_email_mode, lead_inapp_enabled INTO _pref, _inapp
      FROM public.pro_notification_prefs WHERE professional_id = _pro.id;
    _pref := COALESCE(_pref, 'instant'::public.lead_email_mode);
    _inapp := COALESCE(_inapp, TRUE);

    SELECT email::TEXT INTO _email FROM auth.users WHERE id = _pro.user_id;
    _suppressed := FALSE;
    IF _email IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM public.suppressed_emails WHERE email = lower(_email)) INTO _suppressed;
    END IF;

    _email_status := CASE
      WHEN _pref = 'off' THEN 'skipped_pref'
      WHEN _suppressed THEN 'skipped_suppressed'
      WHEN _pref IN ('daily','weekly') THEN 'deferred'
      ELSE 'pending' END;

    INSERT INTO public.lead_match_notifications (job_id, professional_id, email_status, inapp_sent_at)
      VALUES (NEW.id, _pro.id, _email_status, CASE WHEN _inapp THEN now() ELSE NULL END)
      ON CONFLICT (job_id, professional_id) DO NOTHING;

    RAISE NOTICE '[lead-match] pro=% pref=% inapp=% status=%', _pro.id, _pref, _inapp, _email_status;

    IF _inapp THEN
      INSERT INTO public.notifications (user_id, title, body, url)
        VALUES (_pro.user_id, 'New ' || NEW.title || ' lead',
                'New lead in ' || NEW.city || '. Unlock to view customer details.',
                '/pro/leads?job=' || NEW.id::text);
    END IF;

    _count := _count + 1;
  END LOOP;

  RAISE NOTICE '[lead-match] job=% matched_total=%', NEW.id, _count;
  RETURN NEW;
END $function$;

-- 5. Rewrite browse_marketplace_leads
CREATE OR REPLACE FUNCTION public.browse_marketplace_leads()
 RETURNS TABLE(id uuid, title text, summary text, details text, city text, postcode_prefix text, event_date date, event_time time without time zone, budget_band text, duration text, duration_days integer, duration_hours numeric, flexible_dates boolean, inspiration_links text[], expires_at timestamp with time zone, created_at timestamp with time zone, status text, kind text, service_name text, event_type text, urgency text, unlock_credit_cost integer, urgency_status text, max_responses integer, latitude double precision, longitude double precision, response_count integer, unlocked boolean, client_display_name text, customer_first_name text, customer_verified_phone boolean, customer_frequent_user boolean, customer_account_age_days integer, customer_previous_requests integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pro AS (
    SELECT id, city, status, latitude, longitude, service_radius_miles,
           nationwide_service, remote_service
    FROM professionals WHERE user_id = auth.uid()
  ),
  eligible_jobs AS (
    SELECT DISTINCT j.id
    FROM jobs j
    JOIN pro ON pro.status = 'active'
    JOIN professional_services ps
      ON ps.professional_id = pro.id AND ps.service_id = j.service_id
    WHERE j.status = 'open' AND j.expires_at > now()
      AND public.pro_covers_job(
        pro.latitude, pro.longitude, pro.service_radius_miles,
        pro.nationwide_service, pro.remote_service,
        j.latitude, j.longitude, j.remote_ok
      )
  )
  SELECT j.id, j.title, j.summary, j.details, j.city, j.postcode_prefix,
    j.event_date, j.event_time, j.budget_band, j.duration, j.duration_days,
    j.duration_hours, j.flexible_dates, j.inspiration_links, j.expires_at,
    j.created_at, j.status::text, j.kind::text, s.name, j.event_type, j.urgency,
    j.unlock_credit_cost, j.urgency_status, j.max_responses, j.latitude, j.longitude,
    COALESCE((SELECT count(*)::int FROM quote_requests qr WHERE qr.job_id = j.id), 0),
    EXISTS (SELECT 1 FROM lead_unlocks lu WHERE lu.job_id = j.id AND lu.professional_id = (SELECT id FROM pro)),
    CASE WHEN COALESCE(j.show_name_to_pros, true) THEN COALESCE(NULLIF(j.client_display_name, ''), NULLIF(j.contact_name, ''), SPLIT_PART(COALESCE(p.full_name, ''), ' ', 1))
         ELSE 'Private Client' END,
    SPLIT_PART(COALESCE(p.full_name, ''), ' ', 1),
    COALESCE(p.verified_phone, false), COALESCE(p.frequent_user, false),
    GREATEST(0, EXTRACT(DAY FROM (now() - u.created_at))::int),
    COALESCE((SELECT count(*)::int FROM jobs j2 WHERE j2.customer_id = j.customer_id), 0)
  FROM eligible_jobs ej JOIN jobs j ON j.id = ej.id
  LEFT JOIN services s ON s.id = j.service_id
  LEFT JOIN profiles p ON p.id = j.customer_id
  LEFT JOIN auth.users u ON u.id = j.customer_id
  ORDER BY
    CASE j.urgency
      WHEN 'asap' THEN 1 WHEN '3-days' THEN 2 WHEN '1-week' THEN 3
      WHEN '2-weeks' THEN 4 WHEN '1-month' THEN 5 WHEN 'flexible' THEN 6
      ELSE 7
    END ASC,
    j.created_at DESC
  LIMIT 200;
$function$;

-- 6. Update unlock_job eligibility
CREATE OR REPLACE FUNCTION public.unlock_job(_job_id uuid)
 RETURNS TABLE(job_id uuid, quote_request_id uuid, customer_name text, customer_email text, customer_phone text, details text, title text, city text, event_date date, event_time time without time zone, budget_band text, credits_used integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _pro RECORD; _balance INTEGER; _cost INTEGER; _existing UUID; _job RECORD; _matched BOOLEAN; _qr_id UUID; _offers_service BOOLEAN; _in_area BOOLEAN;
BEGIN
  SELECT * INTO _pro FROM public.professionals WHERE user_id = auth.uid();
  IF _pro.id IS NULL THEN RAISE EXCEPTION 'Not a professional'; END IF;
  SELECT * INTO _job FROM public.jobs j WHERE j.id = _job_id AND j.status = 'open';
  IF _job IS NULL THEN RAISE EXCEPTION 'Job not available'; END IF;
  IF _job.expires_at IS NOT NULL AND _job.expires_at < now() THEN RAISE EXCEPTION 'LEAD_EXPIRED'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.lead_matches lm WHERE lm.job_id = _job_id AND lm.professional_id = _pro.id) INTO _matched;

  IF NOT _matched THEN
    SELECT EXISTS (
      SELECT 1 FROM public.professional_services ps
      WHERE ps.professional_id = _pro.id AND ps.service_id = _job.service_id
    ) INTO _offers_service;

    _in_area := public.pro_covers_job(
      _pro.latitude, _pro.longitude, _pro.service_radius_miles,
      _pro.nationwide_service, _pro.remote_service,
      _job.latitude, _job.longitude, _job.remote_ok
    );

    IF _pro.status = 'active' AND _offers_service AND _in_area THEN
      INSERT INTO public.lead_matches (job_id, professional_id)
        VALUES (_job_id, _pro.id) ON CONFLICT DO NOTHING;
      _matched := TRUE;
    END IF;
  END IF;

  IF NOT _matched THEN RAISE EXCEPTION 'NOT_MATCHED'; END IF;

  _cost := _job.unlock_credit_cost;
  IF _cost IS NULL THEN SELECT unlock_cost INTO _cost FROM public.credit_settings WHERE id = 1; END IF;
  SELECT lu.id INTO _existing FROM public.lead_unlocks lu WHERE lu.job_id = _job_id AND lu.professional_id = _pro.id;
  IF _existing IS NULL THEN
    SELECT pc.credit_balance INTO _balance FROM public.professional_credits pc WHERE pc.professional_id = _pro.id FOR UPDATE;
    IF _balance IS NULL THEN INSERT INTO public.professional_credits (professional_id, credit_balance) VALUES (_pro.id, 0); _balance := 0; END IF;
    IF _balance < _cost THEN RAISE EXCEPTION 'INSUFFICIENT_CREDITS'; END IF;
    UPDATE public.professional_credits pc SET credit_balance = pc.credit_balance - _cost WHERE pc.professional_id = _pro.id;
    INSERT INTO public.lead_unlocks (job_id, professional_id, credits_used) VALUES (_job_id, _pro.id, _cost);
    INSERT INTO public.credit_transactions (professional_id, amount, transaction_type, description)
      VALUES (_pro.id, -_cost, 'lead_unlock', 'Unlocked lead: ' || _job.title);
  END IF;
  SELECT qr.id INTO _qr_id FROM public.quote_requests qr
    WHERE qr.job_id = _job_id AND qr.professional_id = _pro.id AND qr.customer_id = _job.customer_id;
  IF _qr_id IS NULL THEN
    INSERT INTO public.quote_requests (job_id, customer_id, professional_id, service_id, event_date, location, budget_band, details, status, last_message_at)
    VALUES (_job_id, _job.customer_id, _pro.id, _job.service_id, _job.event_date, _job.city, _job.budget_band, _job.details, 'pending', now())
    RETURNING id INTO _qr_id;
  END IF;
  RETURN QUERY
    SELECT _job.id, _qr_id, p.full_name, u.email::TEXT, p.phone, _job.details, _job.title, _job.city, _job.event_date, _job.event_time, _job.budget_band, _cost
    FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = _job.customer_id;
END $function$;

-- 7. Recreate pro_lead_visibility_debug with in_area column
CREATE OR REPLACE FUNCTION public.pro_lead_visibility_debug()
 RETURNS TABLE(job_id uuid, title text, job_city text, pro_city text, pro_active boolean, offers_service boolean, in_area boolean, explicit_match boolean, visible boolean, reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pro AS (
    SELECT id, city, status, latitude, longitude, service_radius_miles,
           nationwide_service, remote_service
    FROM professionals WHERE user_id = auth.uid()
  )
  SELECT
    j.id, j.title, j.city, (SELECT city FROM pro),
    (SELECT status='active' FROM pro),
    EXISTS (SELECT 1 FROM professional_services ps WHERE ps.professional_id=(SELECT id FROM pro) AND ps.service_id=j.service_id),
    public.pro_covers_job(
      (SELECT latitude FROM pro), (SELECT longitude FROM pro), (SELECT service_radius_miles FROM pro),
      (SELECT nationwide_service FROM pro), (SELECT remote_service FROM pro),
      j.latitude, j.longitude, j.remote_ok
    ),
    EXISTS (SELECT 1 FROM lead_matches lm WHERE lm.job_id=j.id AND lm.professional_id=(SELECT id FROM pro)),
    (j.status='open' AND j.expires_at>now() AND (SELECT status='active' FROM pro)
      AND EXISTS (SELECT 1 FROM professional_services ps WHERE ps.professional_id=(SELECT id FROM pro) AND ps.service_id=j.service_id)
      AND public.pro_covers_job(
        (SELECT latitude FROM pro), (SELECT longitude FROM pro), (SELECT service_radius_miles FROM pro),
        (SELECT nationwide_service FROM pro), (SELECT remote_service FROM pro),
        j.latitude, j.longitude, j.remote_ok
      )
    ),
    CASE
      WHEN j.status<>'open' THEN 'job_not_open'
      WHEN j.expires_at<=now() THEN 'job_expired'
      WHEN NOT (SELECT status='active' FROM pro) THEN 'pro_inactive'
      WHEN NOT EXISTS (SELECT 1 FROM professional_services ps WHERE ps.professional_id=(SELECT id FROM pro) AND ps.service_id=j.service_id)
        THEN 'service_not_offered'
      WHEN NOT public.pro_covers_job(
        (SELECT latitude FROM pro), (SELECT longitude FROM pro), (SELECT service_radius_miles FROM pro),
        (SELECT nationwide_service FROM pro), (SELECT remote_service FROM pro),
        j.latitude, j.longitude, j.remote_ok
      ) THEN 'out_of_service_area'
      ELSE 'visible'
    END
  FROM jobs j ORDER BY j.created_at DESC LIMIT 100;
$function$;

-- 8. Recreate get_my_professional with new columns
DROP FUNCTION IF EXISTS public.get_my_professional();
CREATE FUNCTION public.get_my_professional()
 RETURNS TABLE(id uuid, slug text, business_name text, contact_name text, postcode text, about text, city text, country text, years_experience integer, cover_image_url text, logo_url text, website text, instagram text, facebook text, tiktok text, starting_price_pence integer, is_verified boolean, status pro_status, rating_avg numeric, rating_count integer, avatar_path text, avatar_kind text, service_radius_miles integer, nationwide_service boolean, remote_service boolean, latitude double precision, longitude double precision, service_area_updated_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, slug, business_name, contact_name, postcode, about, city, country,
         years_experience, cover_image_url, logo_url, website, instagram, facebook,
         tiktok, starting_price_pence, is_verified, status, rating_avg, rating_count,
         avatar_path, avatar_kind,
         service_radius_miles, nationwide_service, remote_service,
         latitude, longitude, service_area_updated_at
  FROM public.professionals
  WHERE user_id = auth.uid();
$function$;
