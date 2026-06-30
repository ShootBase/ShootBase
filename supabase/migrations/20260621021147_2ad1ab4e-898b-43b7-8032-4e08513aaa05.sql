
-- Exclude self-posted jobs from professional matching trigger
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

    IF _inapp THEN
      INSERT INTO public.notifications (user_id, title, body, url)
        VALUES (_pro.user_id, 'New ' || NEW.title || ' lead',
                'New lead in ' || NEW.city || '. Unlock to view customer details.',
                '/pro/leads?job=' || NEW.id::text);
    END IF;

    _count := _count + 1;
  END LOOP;

  RETURN NEW;
END $function$;

-- Hide self-posted jobs from the browse marketplace
CREATE OR REPLACE FUNCTION public.browse_marketplace_leads()
 RETURNS TABLE(id uuid, title text, summary text, details text, city text, postcode_prefix text, event_date date, event_time time without time zone, budget_band text, duration text, duration_days integer, duration_hours numeric, flexible_dates boolean, inspiration_links text[], expires_at timestamp with time zone, created_at timestamp with time zone, status text, kind text, service_name text, event_type text, urgency text, unlock_credit_cost integer, urgency_status text, max_responses integer, latitude double precision, longitude double precision, response_count integer, unlocked boolean, client_display_name text, customer_first_name text, customer_verified_phone boolean, customer_frequent_user boolean, customer_account_age_days integer, customer_previous_requests integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pro AS (
    SELECT id, user_id, city, status, latitude, longitude, service_radius_miles,
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
      AND j.customer_id <> pro.user_id
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
