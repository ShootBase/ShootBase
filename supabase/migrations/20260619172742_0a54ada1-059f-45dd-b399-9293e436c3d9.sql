
-- jobs columns
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS duration_hours numeric,
  ADD COLUMN IF NOT EXISTS urgency_status text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS postcode_prefix text,
  ADD COLUMN IF NOT EXISTS unlock_credit_cost integer,
  ADD COLUMN IF NOT EXISTS max_responses integer NOT NULL DEFAULT 5;

-- profiles columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified_phone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frequent_user boolean NOT NULL DEFAULT false;

-- helper: credits
CREATE OR REPLACE FUNCTION public.calculate_lead_credits(_hours numeric)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN _hours IS NOT NULL AND _hours >= 6 THEN 10 ELSE 8 END;
$$;

-- trigger: compute derived fields
CREATE OR REPLACE FUNCTION public.tg_jobs_compute_marketplace()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE _hours numeric;
BEGIN
  _hours := NEW.duration_hours;
  IF _hours IS NULL AND NEW.duration_days IS NOT NULL THEN
    _hours := NEW.duration_days * 8;
  END IF;
  NEW.duration_hours := _hours;
  NEW.unlock_credit_cost := public.calculate_lead_credits(_hours);
  NEW.urgency_status := CASE
    WHEN NEW.event_date IS NOT NULL AND NEW.event_date <= (CURRENT_DATE + INTERVAL '7 days')::date
      THEN 'urgent'
    ELSE 'normal'
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS jobs_compute_marketplace ON public.jobs;
CREATE TRIGGER jobs_compute_marketplace
BEFORE INSERT OR UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.tg_jobs_compute_marketplace();

-- Backfill existing rows
UPDATE public.jobs SET updated_at = updated_at;

-- Update unlock_job to use per-job cost
CREATE OR REPLACE FUNCTION public.unlock_job(_job_id uuid)
 RETURNS TABLE(job_id uuid, quote_request_id uuid, customer_name text, customer_email text, customer_phone text, details text, title text, city text, event_date date, event_time time without time zone, budget_band text, credits_used integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pro_id UUID; _balance INTEGER; _cost INTEGER; _existing UUID; _job RECORD; _matched BOOLEAN; _qr_id UUID;
BEGIN
  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = auth.uid();
  IF _pro_id IS NULL THEN RAISE EXCEPTION 'Not a professional'; END IF;

  SELECT * INTO _job FROM public.jobs j WHERE j.id = _job_id AND j.status = 'open';
  IF _job IS NULL THEN RAISE EXCEPTION 'Job not available'; END IF;
  IF _job.expires_at IS NOT NULL AND _job.expires_at < now() THEN RAISE EXCEPTION 'LEAD_EXPIRED'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.lead_matches lm WHERE lm.job_id = _job_id AND lm.professional_id = _pro_id) INTO _matched;
  IF NOT _matched THEN RAISE EXCEPTION 'NOT_MATCHED'; END IF;

  _cost := _job.unlock_credit_cost;
  IF _cost IS NULL THEN
    SELECT unlock_cost INTO _cost FROM public.credit_settings WHERE id = 1;
  END IF;

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

  SELECT id INTO _qr_id FROM public.quote_requests
    WHERE job_id = _job_id AND professional_id = _pro_id AND customer_id = _job.customer_id;

  IF _qr_id IS NULL THEN
    INSERT INTO public.quote_requests (job_id, customer_id, professional_id, service_id, event_date, location, budget_band, details, status, last_message_at)
    VALUES (_job_id, _job.customer_id, _pro_id, _job.service_id, _job.event_date, _job.city, _job.budget_band, _job.details, 'pending', now())
    RETURNING id INTO _qr_id;
  END IF;

  RETURN QUERY
    SELECT _job.id, _qr_id, p.full_name, u.email::TEXT, p.phone, _job.details, _job.title, _job.city, _job.event_date, _job.event_time, _job.budget_band, _cost
    FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = _job.customer_id;
END $function$;
