
-- 1. Dynamic browse: union explicit matches with on-the-fly eligibility
CREATE OR REPLACE FUNCTION public.browse_marketplace_leads()
 RETURNS TABLE(id uuid, title text, summary text, details text, city text, postcode_prefix text, event_date date, event_time time without time zone, budget_band text, duration text, duration_days integer, duration_hours numeric, flexible_dates boolean, inspiration_links text[], expires_at timestamp with time zone, created_at timestamp with time zone, status text, kind text, service_name text, event_type text, unlock_credit_cost integer, urgency_status text, max_responses integer, latitude double precision, longitude double precision, response_count integer, unlocked boolean, customer_first_name text, customer_verified_phone boolean, customer_frequent_user boolean, customer_account_age_days integer, customer_previous_requests integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pro AS (
    SELECT id, city, status FROM professionals WHERE user_id = auth.uid()
  ),
  eligible_jobs AS (
    SELECT DISTINCT j.id
    FROM jobs j
    JOIN pro ON pro.status = 'active'
    LEFT JOIN professional_services ps
      ON ps.professional_id = pro.id AND ps.service_id = j.service_id
    LEFT JOIN lead_matches lm
      ON lm.job_id = j.id AND lm.professional_id = pro.id
    WHERE j.status = 'open' AND j.expires_at > now()
      AND (
        lm.job_id IS NOT NULL                          -- explicitly matched
        OR ps.service_id IS NOT NULL                   -- pro offers this service
      )
  )
  SELECT j.id, j.title, j.summary, j.details, j.city, j.postcode_prefix,
    j.event_date, j.event_time, j.budget_band, j.duration, j.duration_days,
    j.duration_hours, j.flexible_dates, j.inspiration_links, j.expires_at,
    j.created_at, j.status::text, j.kind::text, s.name, j.event_type,
    j.unlock_credit_cost, j.urgency_status, j.max_responses, j.latitude, j.longitude,
    COALESCE((SELECT count(*)::int FROM quote_requests qr WHERE qr.job_id = j.id), 0),
    EXISTS (SELECT 1 FROM lead_unlocks lu WHERE lu.job_id = j.id AND lu.professional_id = (SELECT id FROM pro)),
    SPLIT_PART(COALESCE(p.full_name, ''), ' ', 1),
    COALESCE(p.verified_phone, false), COALESCE(p.frequent_user, false),
    GREATEST(0, EXTRACT(DAY FROM (now() - u.created_at))::int),
    COALESCE((SELECT count(*)::int FROM jobs j2 WHERE j2.customer_id = j.customer_id), 0)
  FROM eligible_jobs ej
  JOIN jobs j ON j.id = ej.id
  LEFT JOIN services s ON s.id = j.service_id
  LEFT JOIN profiles p ON p.id = j.customer_id
  LEFT JOIN auth.users u ON u.id = j.customer_id
  ORDER BY
    -- Prioritise same-city, then explicit matches, then recency
    (j.city ILIKE (SELECT city FROM pro)) DESC,
    EXISTS (SELECT 1 FROM lead_matches lm2 WHERE lm2.job_id = j.id AND lm2.professional_id = (SELECT id FROM pro)) DESC,
    j.created_at DESC
  LIMIT 200;
$function$;

-- 2. unlock_job: auto-create lead_match if pro qualifies dynamically
CREATE OR REPLACE FUNCTION public.unlock_job(_job_id uuid)
 RETURNS TABLE(job_id uuid, quote_request_id uuid, customer_name text, customer_email text, customer_phone text, details text, title text, city text, event_date date, event_time time without time zone, budget_band text, credits_used integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _pro_id UUID; _balance INTEGER; _cost INTEGER; _existing UUID; _job RECORD; _matched BOOLEAN; _qr_id UUID; _offers_service BOOLEAN; _pro_status TEXT;
BEGIN
  SELECT id, status INTO _pro_id, _pro_status FROM public.professionals WHERE user_id = auth.uid();
  IF _pro_id IS NULL THEN RAISE EXCEPTION 'Not a professional'; END IF;
  SELECT * INTO _job FROM public.jobs j WHERE j.id = _job_id AND j.status = 'open';
  IF _job IS NULL THEN RAISE EXCEPTION 'Job not available'; END IF;
  IF _job.expires_at IS NOT NULL AND _job.expires_at < now() THEN RAISE EXCEPTION 'LEAD_EXPIRED'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.lead_matches lm WHERE lm.job_id = _job_id AND lm.professional_id = _pro_id) INTO _matched;

  -- Dynamic eligibility: active pro offering the requested service can unlock
  IF NOT _matched THEN
    SELECT EXISTS (
      SELECT 1 FROM public.professional_services ps
      WHERE ps.professional_id = _pro_id AND ps.service_id = _job.service_id
    ) INTO _offers_service;
    IF _pro_status = 'active' AND _offers_service THEN
      INSERT INTO public.lead_matches (job_id, professional_id)
        VALUES (_job_id, _pro_id) ON CONFLICT DO NOTHING;
      _matched := TRUE;
    END IF;
  END IF;

  IF NOT _matched THEN RAISE EXCEPTION 'NOT_MATCHED'; END IF;

  _cost := _job.unlock_credit_cost;
  IF _cost IS NULL THEN SELECT unlock_cost INTO _cost FROM public.credit_settings WHERE id = 1; END IF;
  SELECT lu.id INTO _existing FROM public.lead_unlocks lu WHERE lu.job_id = _job_id AND lu.professional_id = _pro_id;
  IF _existing IS NULL THEN
    SELECT pc.credit_balance INTO _balance FROM public.professional_credits pc WHERE pc.professional_id = _pro_id FOR UPDATE;
    IF _balance IS NULL THEN INSERT INTO public.professional_credits (professional_id, credit_balance) VALUES (_pro_id, 0); _balance := 0; END IF;
    IF _balance < _cost THEN RAISE EXCEPTION 'INSUFFICIENT_CREDITS'; END IF;
    UPDATE public.professional_credits pc SET credit_balance = pc.credit_balance - _cost WHERE pc.professional_id = _pro_id;
    INSERT INTO public.lead_unlocks (job_id, professional_id, credits_used) VALUES (_job_id, _pro_id, _cost);
    INSERT INTO public.credit_transactions (professional_id, amount, transaction_type, description)
      VALUES (_pro_id, -_cost, 'lead_unlock', 'Unlocked lead: ' || _job.title);
  END IF;
  SELECT qr.id INTO _qr_id FROM public.quote_requests qr
    WHERE qr.job_id = _job_id AND qr.professional_id = _pro_id AND qr.customer_id = _job.customer_id;
  IF _qr_id IS NULL THEN
    INSERT INTO public.quote_requests (job_id, customer_id, professional_id, service_id, event_date, location, budget_band, details, status, last_message_at)
    VALUES (_job_id, _job.customer_id, _pro_id, _job.service_id, _job.event_date, _job.city, _job.budget_band, _job.details, 'pending', now())
    RETURNING id INTO _qr_id;
  END IF;
  RETURN QUERY
    SELECT _job.id, _qr_id, p.full_name, u.email::TEXT, p.phone, _job.details, _job.title, _job.city, _job.event_date, _job.event_time, _job.budget_band, _cost
    FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = _job.customer_id;
END $function$;

-- 3. Backfill matches for existing live jobs
INSERT INTO public.lead_matches (job_id, professional_id)
SELECT j.id, pr.id
FROM public.jobs j
JOIN public.professional_services ps ON ps.service_id = j.service_id
JOIN public.professionals pr ON pr.id = ps.professional_id
WHERE j.status = 'open' AND j.expires_at > now() AND pr.status = 'active'
ON CONFLICT DO NOTHING;

-- 4. Diagnostics function: tells the caller why a job is/isn't visible to them
CREATE OR REPLACE FUNCTION public.pro_lead_visibility_debug()
 RETURNS TABLE(job_id uuid, title text, job_city text, pro_city text, pro_active boolean, offers_service boolean, explicit_match boolean, visible boolean, reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pro AS (SELECT id, city, status FROM professionals WHERE user_id = auth.uid())
  SELECT
    j.id, j.title, j.city, (SELECT city FROM pro),
    (SELECT status='active' FROM pro),
    EXISTS (SELECT 1 FROM professional_services ps WHERE ps.professional_id=(SELECT id FROM pro) AND ps.service_id=j.service_id),
    EXISTS (SELECT 1 FROM lead_matches lm WHERE lm.job_id=j.id AND lm.professional_id=(SELECT id FROM pro)),
    (j.status='open' AND j.expires_at>now() AND (SELECT status='active' FROM pro) AND (
      EXISTS (SELECT 1 FROM lead_matches lm WHERE lm.job_id=j.id AND lm.professional_id=(SELECT id FROM pro))
      OR EXISTS (SELECT 1 FROM professional_services ps WHERE ps.professional_id=(SELECT id FROM pro) AND ps.service_id=j.service_id)
    )),
    CASE
      WHEN j.status<>'open' THEN 'job_not_open'
      WHEN j.expires_at<=now() THEN 'job_expired'
      WHEN NOT (SELECT status='active' FROM pro) THEN 'pro_inactive'
      WHEN NOT EXISTS (SELECT 1 FROM professional_services ps WHERE ps.professional_id=(SELECT id FROM pro) AND ps.service_id=j.service_id)
        AND NOT EXISTS (SELECT 1 FROM lead_matches lm WHERE lm.job_id=j.id AND lm.professional_id=(SELECT id FROM pro))
        THEN 'service_not_offered'
      ELSE 'visible'
    END
  FROM jobs j ORDER BY j.created_at DESC LIMIT 100;
$function$;

GRANT EXECUTE ON FUNCTION public.pro_lead_visibility_debug() TO authenticated;
