
CREATE OR REPLACE FUNCTION public.unlock_job(_job_id uuid)
 RETURNS TABLE(job_id uuid, customer_name text, customer_email text, customer_phone text, details text, title text, city text, event_date date, event_time time without time zone, budget_band text, credits_used integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pro_id UUID;
  _balance INTEGER;
  _cost INTEGER;
  _existing UUID;
  _job RECORD;
  _matched BOOLEAN;
BEGIN
  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = auth.uid();
  IF _pro_id IS NULL THEN RAISE EXCEPTION 'Not a professional'; END IF;

  SELECT * INTO _job FROM public.jobs j WHERE j.id = _job_id AND j.status = 'open';
  IF _job IS NULL THEN RAISE EXCEPTION 'Job not available'; END IF;
  IF _job.expires_at IS NOT NULL AND _job.expires_at < now() THEN RAISE EXCEPTION 'LEAD_EXPIRED'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.lead_matches lm WHERE lm.job_id = _job_id AND lm.professional_id = _pro_id) INTO _matched;
  IF NOT _matched THEN RAISE EXCEPTION 'NOT_MATCHED'; END IF;

  SELECT unlock_cost INTO _cost FROM public.credit_settings WHERE id = 1;

  SELECT lu.id INTO _existing FROM public.lead_unlocks lu WHERE lu.job_id = _job_id AND lu.professional_id = _pro_id;
  IF _existing IS NULL THEN
    SELECT pc.credit_balance INTO _balance FROM public.professional_credits pc WHERE pc.professional_id = _pro_id FOR UPDATE;
    IF _balance IS NULL THEN
      INSERT INTO public.professional_credits (professional_id, credit_balance) VALUES (_pro_id, 0);
      _balance := 0;
    END IF;
    IF _balance < _cost THEN RAISE EXCEPTION 'INSUFFICIENT_CREDITS'; END IF;

    UPDATE public.professional_credits pc SET credit_balance = pc.credit_balance - _cost WHERE pc.professional_id = _pro_id;
    INSERT INTO public.lead_unlocks (job_id, professional_id, credits_used) VALUES (_job_id, _pro_id, _cost);
    INSERT INTO public.credit_transactions (professional_id, amount, transaction_type, description)
      VALUES (_pro_id, -_cost, 'lead_unlock', 'Unlocked lead: ' || _job.title);
  END IF;

  RETURN QUERY
    SELECT _job.id AS job_id,
           p.full_name AS customer_name,
           u.email::TEXT AS customer_email,
           p.phone AS customer_phone,
           _job.details,
           _job.title,
           _job.city,
           _job.event_date,
           _job.event_time,
           _job.budget_band,
           _cost AS credits_used
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.id = _job.customer_id;
END $function$;
