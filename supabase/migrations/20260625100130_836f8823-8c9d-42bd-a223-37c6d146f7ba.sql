
-- 1) Allow extra pros (premium "open to more pros" exception)
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS allow_extra_pros boolean NOT NULL DEFAULT false;

-- 2) Welcome bonus = 10 coins for new pros
UPDATE public.credit_settings SET welcome_bonus = 10 WHERE id = 1;

-- 3) browse_marketplace_leads: expose allow_extra_pros
DROP FUNCTION IF EXISTS public.browse_marketplace_leads();
CREATE OR REPLACE FUNCTION public.browse_marketplace_leads()
 RETURNS TABLE(id uuid, title text, summary text, details text, city text, postcode_prefix text,
   event_date date, event_time time without time zone, budget_band text, duration text,
   duration_days integer, duration_hours numeric, flexible_dates boolean,
   inspiration_links text[], expires_at timestamp with time zone, created_at timestamp with time zone,
   status text, kind text, service_name text, event_type text, urgency text,
   unlock_credit_cost integer, urgency_status text, max_responses integer,
   latitude double precision, longitude double precision, response_count integer, unlocked boolean,
   client_display_name text, customer_first_name text, customer_verified_phone boolean,
   customer_frequent_user boolean, customer_account_age_days integer, customer_previous_requests integer,
   customer_verified boolean,
   masked_contact_email text, masked_contact_phone text,
   customer_member_since timestamp with time zone,
   allow_extra_pros boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH pro AS (
    SELECT id, user_id, city, status, latitude, longitude, service_radius_miles,
           nationwide_service, remote_service
    FROM professionals WHERE user_id = auth.uid()
  ),
  eligible_jobs AS (
    SELECT DISTINCT j.id
    FROM jobs j JOIN pro ON pro.status = 'active'
    JOIN professional_services ps ON ps.professional_id = pro.id AND ps.service_id = j.service_id
    WHERE j.status = 'open' AND j.expires_at > now()
      AND j.customer_id <> pro.user_id
      AND public.pro_covers_job(
        pro.latitude, pro.longitude, pro.service_radius_miles,
        pro.nationwide_service, pro.remote_service,
        j.latitude, j.longitude, j.remote_ok)
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
    COALESCE((SELECT count(*)::int FROM jobs j2 WHERE j2.customer_id = j.customer_id), 0),
    COALESCE(p.verified, false),
    public.mask_email(u.email::text),
    public.mask_phone(COALESCE(j.contact_phone, p.phone)),
    u.created_at,
    COALESCE(j.allow_extra_pros, false)
  FROM eligible_jobs ej JOIN jobs j ON j.id = ej.id
  LEFT JOIN services s ON s.id = j.service_id
  LEFT JOIN profiles p ON p.id = j.customer_id
  LEFT JOIN auth.users u ON u.id = j.customer_id
  ORDER BY
    CASE j.urgency
      WHEN 'asap' THEN 1 WHEN '3-days' THEN 2 WHEN '1-week' THEN 3
      WHEN '2-weeks' THEN 4 WHEN '1-month' THEN 5 WHEN 'flexible' THEN 6
      ELSE 7 END ASC,
    j.created_at DESC
  LIMIT 200;
$$;

-- 4) unlock_job: enforce max_responses unless job opted-in to allow_extra_pros
CREATE OR REPLACE FUNCTION public.unlock_job(_job_id uuid)
 RETURNS TABLE(job_id uuid, quote_request_id uuid, customer_name text, customer_email text, customer_phone text, details text, title text, city text, event_date date, event_time time without time zone, budget_band text, credits_used integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _pro RECORD; _balance INTEGER; _cost INTEGER; _existing UUID; _job RECORD; _matched BOOLEAN; _qr_id UUID; _offers_service BOOLEAN; _in_area BOOLEAN; _resp_count INT;
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

  -- Enforce max_responses cap unless poster opted-in to allow extra pros,
  -- or this pro has already unlocked the lead (re-fetching is always allowed).
  SELECT lu.id INTO _existing FROM public.lead_unlocks lu WHERE lu.job_id = _job_id AND lu.professional_id = _pro.id;
  IF _existing IS NULL AND NOT COALESCE(_job.allow_extra_pros, false) THEN
    SELECT count(*)::int INTO _resp_count FROM public.quote_requests qr WHERE qr.job_id = _job_id;
    IF _resp_count >= COALESCE(_job.max_responses, 5) THEN
      RAISE EXCEPTION 'LEAD_FULL';
    END IF;
  END IF;

  _cost := _job.unlock_credit_cost;
  IF _cost IS NULL THEN SELECT unlock_cost INTO _cost FROM public.credit_settings WHERE id = 1; END IF;
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

REVOKE ALL ON FUNCTION public.unlock_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_job(uuid) TO authenticated;
