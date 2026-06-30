-- Strict country isolation for leads / projects / professionals.
-- Every lead-facing RPC and matching trigger must restrict rows by
-- the country of the calling user. UK (GB) and Nigeria (NG) data
-- must never cross.

UPDATE public.profiles      SET country = 'United Kingdom' WHERE country IS NULL;
UPDATE public.jobs          SET country = 'United Kingdom' WHERE country IS NULL;
UPDATE public.professionals SET country = 'United Kingdom' WHERE country IS NULL;

CREATE OR REPLACE FUNCTION public.browse_marketplace_leads()
 RETURNS TABLE(id uuid, title text, summary text, details text, city text, postcode_prefix text, event_date date, event_time time without time zone, budget_band text, duration text, duration_days integer, duration_hours numeric, flexible_dates boolean, inspiration_links text[], expires_at timestamp with time zone, created_at timestamp with time zone, status text, kind text, service_name text, event_type text, urgency text, unlock_credit_cost integer, urgency_status text, max_responses integer, latitude double precision, longitude double precision, response_count integer, unlocked boolean, client_display_name text, customer_first_name text, customer_verified_phone boolean, customer_frequent_user boolean, customer_account_age_days integer, customer_previous_requests integer, customer_verified boolean, masked_contact_email text, masked_contact_phone text, customer_member_since timestamp with time zone, allow_extra_pros boolean, distance_miles double precision, priority_radius_miles integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pro AS (
    SELECT id, user_id, latitude, longitude, COALESCE(country, 'United Kingdom') AS country
    FROM professionals WHERE user_id = auth.uid()
  ),
  settings AS (
    SELECT COALESCE(priority_radius_miles, 50) AS prio_radius
    FROM credit_settings WHERE id = 1
  ),
  eligible_jobs AS (
    SELECT DISTINCT j.id
    FROM jobs j
    JOIN pro ON true
    JOIN professional_services ps
      ON ps.professional_id = pro.id AND ps.service_id = j.service_id
    WHERE j.status = 'open' AND j.expires_at > now()
      AND j.customer_id <> pro.user_id
      AND COALESCE(j.country, 'United Kingdom') = pro.country
  )
  SELECT j.id, j.title, j.summary, j.details, j.city, j.postcode_prefix,
    j.event_date, j.event_time, j.budget_band, j.duration, j.duration_days,
    j.duration_hours, j.flexible_dates, j.inspiration_links, j.expires_at,
    j.created_at, j.status::text, j.kind::text, s.name, j.event_type, j.urgency,
    j.unlock_credit_cost, j.urgency_status, j.max_responses, j.latitude, j.longitude,
    COALESCE((SELECT count(*)::int FROM quote_requests qr WHERE qr.job_id = j.id), 0),
    EXISTS (SELECT 1 FROM lead_unlocks lu WHERE lu.job_id = j.id AND lu.professional_id = (SELECT id FROM pro)),
    CASE WHEN COALESCE(j.show_name_to_pros, true)
      THEN COALESCE(NULLIF(j.client_display_name, ''), NULLIF(j.contact_name, ''), SPLIT_PART(COALESCE(p.full_name, ''), ' ', 1))
      ELSE 'Private Client' END,
    SPLIT_PART(COALESCE(p.full_name, ''), ' ', 1),
    COALESCE(p.verified_phone, false), COALESCE(p.frequent_user, false),
    GREATEST(0, EXTRACT(DAY FROM (now() - u.created_at))::int),
    COALESCE((SELECT count(*)::int FROM jobs j2 WHERE j2.customer_id = j.customer_id), 0),
    COALESCE(p.verified, false),
    public.mask_email(u.email::text),
    public.mask_phone(COALESCE(j.contact_phone, p.phone)),
    u.created_at,
    COALESCE(j.allow_extra_pros, false),
    CASE
      WHEN (SELECT latitude FROM pro) IS NOT NULL
       AND (SELECT longitude FROM pro) IS NOT NULL
       AND j.latitude IS NOT NULL AND j.longitude IS NOT NULL
      THEN public.miles_between(
        (SELECT latitude FROM pro), (SELECT longitude FROM pro),
        j.latitude, j.longitude)
      ELSE NULL
    END,
    (SELECT prio_radius FROM settings)
  FROM eligible_jobs ej JOIN jobs j ON j.id = ej.id
  LEFT JOIN services s ON s.id = j.service_id
  LEFT JOIN profiles p ON p.id = j.customer_id
  LEFT JOIN auth.users u ON u.id = j.customer_id
  ORDER BY
    CASE
      WHEN (SELECT latitude FROM pro) IS NULL OR (SELECT longitude FROM pro) IS NULL
        OR j.latitude IS NULL OR j.longitude IS NULL THEN 5
      WHEN public.miles_between((SELECT latitude FROM pro),(SELECT longitude FROM pro),j.latitude,j.longitude) <= 10 THEN 1
      WHEN public.miles_between((SELECT latitude FROM pro),(SELECT longitude FROM pro),j.latitude,j.longitude) <= 25 THEN 2
      WHEN public.miles_between((SELECT latitude FROM pro),(SELECT longitude FROM pro),j.latitude,j.longitude) <= (SELECT prio_radius FROM settings) THEN 3
      ELSE 4
    END ASC,
    CASE j.urgency
      WHEN 'asap' THEN 1 WHEN '3-days' THEN 2 WHEN '1-week' THEN 3
      WHEN '2-weeks' THEN 4 WHEN '1-month' THEN 5 WHEN 'flexible' THEN 6
      ELSE 7 END ASC,
    j.created_at DESC
  LIMIT 200;
$function$;

CREATE OR REPLACE FUNCTION public.my_unlocked_leads()
 RETURNS TABLE(unlock_id uuid, job_id uuid, unlocked_at timestamp with time zone, credits_used integer, title text, city text, event_date date, event_time time without time zone, budget_band text, details text, customer_name text, customer_email text, customer_phone text, customer_verified_phone boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT lu.id, j.id, lu.unlocked_at, lu.credits_used, j.title, j.city, j.event_date, j.event_time, j.budget_band, j.details,
         p.full_name, u.email::TEXT, p.phone, COALESCE(p.verified_phone, false)
  FROM public.lead_unlocks lu
  JOIN public.professionals pr ON pr.id = lu.professional_id AND pr.user_id = auth.uid()
  JOIN public.jobs j ON j.id = lu.job_id
   AND COALESCE(j.country, 'United Kingdom') = COALESCE(pr.country, 'United Kingdom')
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = p.id
  ORDER BY lu.unlocked_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.my_matching_leads()
 RETURNS TABLE(notification_id uuid, job_id uuid, created_at timestamp with time zone, email_status text, title text, city text, service_name text, event_date date, budget_band text, summary text, urgency text, unlocked boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pro AS (SELECT id, user_id, COALESCE(country, 'United Kingdom') AS country FROM public.professionals WHERE user_id = auth.uid())
  SELECT lmn.id, j.id, lmn.created_at, lmn.email_status,
         j.title, j.city, s.name, j.event_date, j.budget_band, j.summary, j.urgency,
         EXISTS (
           SELECT 1 FROM public.lead_unlocks lu
           WHERE lu.job_id = j.id AND lu.professional_id = (SELECT id FROM pro)
         )
  FROM public.lead_match_notifications lmn
  JOIN public.jobs j ON j.id = lmn.job_id
   AND COALESCE(j.country, 'United Kingdom') = (SELECT country FROM pro)
  LEFT JOIN public.services s ON s.id = j.service_id
  WHERE lmn.professional_id = (SELECT id FROM pro)
    AND j.status = 'open'
    AND j.expires_at > now()
    AND NOT EXISTS (
      SELECT 1 FROM public.lead_unlocks lu
      WHERE lu.job_id = j.id AND lu.professional_id = (SELECT id FROM pro)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.pro_lead_dismissals d
      WHERE d.job_id = j.id AND d.professional_id = (SELECT id FROM pro)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.quote_requests qr ON qr.id = m.quote_request_id
      WHERE qr.job_id = j.id
        AND qr.professional_id = (SELECT id FROM pro)
        AND m.sender_id = (SELECT user_id FROM pro)
    )
  ORDER BY lmn.created_at DESC
  LIMIT 50;
$function$;

CREATE OR REPLACE FUNCTION public.suggest_pros_for_job(_job_id uuid)
 RETURNS TABLE(professional_id uuid, slug text, business_name text, city text, about text, is_verified boolean, avatar_path text, rating_avg numeric, rating_count integer, distance_miles double precision, service_name text, response_rate_pct integer, avg_response_minutes integer, successful_intros integer, profile_completeness_pct integer, already_invited boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _job RECORD;
BEGIN
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id;
  IF _job IS NULL THEN RETURN; END IF;
  IF _job.customer_id <> auth.uid() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  SELECT
    pr.id, pr.slug, pr.business_name, pr.city,
    LEFT(COALESCE(pr.about,''), 200),
    pr.is_verified, pr.avatar_path, pr.rating_avg, pr.rating_count,
    public.miles_between(pr.latitude, pr.longitude, _job.latitude, _job.longitude),
    s.name, pr.response_rate_pct, pr.avg_response_minutes,
    pr.successful_intros, pr.profile_completeness_pct,
    EXISTS (SELECT 1 FROM public.pro_contact_requests cr WHERE cr.job_id = _job_id AND cr.professional_id = pr.id)
  FROM public.professionals pr
  JOIN public.professional_services ps ON ps.professional_id = pr.id AND ps.service_id = _job.service_id
  LEFT JOIN public.services s ON s.id = _job.service_id
  WHERE pr.status = 'active'
    AND pr.user_id <> auth.uid()
    AND COALESCE(pr.country, 'United Kingdom') = COALESCE(_job.country, 'United Kingdom')
    AND public.pro_covers_job(
      pr.latitude, pr.longitude, pr.service_radius_miles,
      pr.nationwide_service, pr.remote_service,
      _job.latitude, _job.longitude, _job.remote_ok
    )
  ORDER BY
    COALESCE(public.miles_between(pr.latitude, pr.longitude, _job.latitude, _job.longitude), 9999) ASC,
    COALESCE(pr.response_rate_pct, 0) DESC,
    pr.successful_intros DESC,
    pr.profile_completeness_pct DESC,
    pr.rating_avg DESC NULLS LAST
  LIMIT 12;
END $function$;

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

  FOR _pro IN
    SELECT DISTINCT pr.id, pr.user_id, pr.rating_avg
    FROM public.professional_services ps
    JOIN public.professionals pr ON pr.id = ps.professional_id
    WHERE ps.service_id = NEW.service_id
      AND pr.status = 'active'
      AND pr.user_id <> NEW.customer_id
      AND COALESCE(pr.country, 'United Kingdom') = COALESCE(NEW.country, 'United Kingdom')
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
      ON CONFLICT DO NOTHING;

    _count := _count + 1;
  END LOOP;

  RETURN NEW;
END $function$;