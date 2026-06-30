
-- Add customer_verified_phone to unlock_job + my_unlocked_leads return types.

DROP FUNCTION IF EXISTS public.unlock_job(uuid);
CREATE OR REPLACE FUNCTION public.unlock_job(_job_id uuid)
 RETURNS TABLE(job_id uuid, quote_request_id uuid, customer_name text, customer_email text, customer_phone text, customer_verified_phone boolean, details text, title text, city text, event_date date, event_time time without time zone, budget_band text, credits_used integer)
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
    SELECT _job.id, _qr_id, p.full_name, u.email::TEXT, p.phone, COALESCE(p.verified_phone, false), _job.details, _job.title, _job.city, _job.event_date, _job.event_time, _job.budget_band, _cost
    FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = _job.customer_id;
END $function$;
REVOKE ALL ON FUNCTION public.unlock_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_job(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.my_unlocked_leads();
CREATE OR REPLACE FUNCTION public.my_unlocked_leads()
RETURNS TABLE(unlock_id uuid, job_id uuid, unlocked_at timestamptz, credits_used integer, title text, city text, event_date date, event_time time without time zone, budget_band text, details text, customer_name text, customer_email text, customer_phone text, customer_verified_phone boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT lu.id, j.id, lu.unlocked_at, lu.credits_used, j.title, j.city, j.event_date, j.event_time, j.budget_band, j.details,
         p.full_name, u.email::TEXT, p.phone, COALESCE(p.verified_phone, false)
  FROM public.lead_unlocks lu
  JOIN public.professionals pr ON pr.id = lu.professional_id AND pr.user_id = auth.uid()
  JOIN public.jobs j ON j.id = lu.job_id
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = p.id
  ORDER BY lu.unlocked_at DESC;
$fn$;
REVOKE ALL ON FUNCTION public.my_unlocked_leads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_unlocked_leads() TO authenticated;
