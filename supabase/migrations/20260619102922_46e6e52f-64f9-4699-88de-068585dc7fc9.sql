
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS event_time TIME,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days');
CREATE INDEX IF NOT EXISTS jobs_expires_idx ON public.jobs(expires_at);

CREATE TABLE IF NOT EXISTS public.lead_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, professional_id)
);
CREATE INDEX IF NOT EXISTS lead_matches_pro_idx ON public.lead_matches(professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_matches_job_idx ON public.lead_matches(job_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_matches TO authenticated;
GRANT ALL ON public.lead_matches TO service_role;
ALTER TABLE public.lead_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_matches self read" ON public.lead_matches;
CREATE POLICY "lead_matches self read" ON public.lead_matches FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = lead_matches.professional_id AND p.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "jobs matched pro read" ON public.jobs;
CREATE POLICY "jobs matched pro read" ON public.jobs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lead_matches lm
    JOIN public.professionals p ON p.id = lm.professional_id
    WHERE lm.job_id = jobs.id AND p.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.tg_match_pros_on_new_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _pro RECORD;
  _count INTEGER := 0;
  _max INTEGER := 5;
BEGIN
  IF NEW.status <> 'open' OR NEW.service_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR _pro IN
    SELECT DISTINCT pr.id, pr.user_id, pr.rating_avg
    FROM public.professional_services ps
    JOIN public.professionals pr ON pr.id = ps.professional_id
    WHERE ps.service_id = NEW.service_id
      AND pr.status = 'active'
      AND pr.city ILIKE NEW.city
    ORDER BY pr.rating_avg DESC NULLS LAST
    LIMIT _max
  LOOP
    INSERT INTO public.lead_matches (job_id, professional_id) VALUES (NEW.id, _pro.id) ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, title, body, url)
      VALUES (_pro.user_id, 'New ' || NEW.title || ' lead', 'New lead in ' || NEW.city || '. Unlock to view customer details.', '/pro/leads');
    _count := _count + 1;
  END LOOP;

  IF _count < 3 THEN
    FOR _pro IN
      SELECT DISTINCT pr.id, pr.user_id
      FROM public.professional_services ps
      JOIN public.professionals pr ON pr.id = ps.professional_id
      WHERE ps.service_id = NEW.service_id
        AND pr.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM public.lead_matches lm WHERE lm.job_id = NEW.id AND lm.professional_id = pr.id)
      ORDER BY pr.rating_avg DESC NULLS LAST
      LIMIT (_max - _count)
    LOOP
      INSERT INTO public.lead_matches (job_id, professional_id) VALUES (NEW.id, _pro.id) ON CONFLICT DO NOTHING;
      INSERT INTO public.notifications (user_id, title, body, url)
        VALUES (_pro.user_id, 'New ' || NEW.title || ' lead', 'New lead in ' || NEW.city || '. Unlock to view customer details.', '/pro/leads');
      _count := _count + 1;
      EXIT WHEN _count >= 3;
    END LOOP;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_jobs_notify ON public.jobs;
DROP TRIGGER IF EXISTS tg_jobs_match ON public.jobs;
CREATE TRIGGER tg_jobs_match AFTER INSERT ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.tg_match_pros_on_new_job();

CREATE OR REPLACE FUNCTION public.unlock_job(_job_id uuid)
RETURNS TABLE(job_id uuid, customer_name text, customer_email text, customer_phone text, details text, title text, city text, event_date date, event_time time, budget_band text, credits_used integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  SELECT * INTO _job FROM public.jobs WHERE id = _job_id AND status = 'open';
  IF _job IS NULL THEN RAISE EXCEPTION 'Job not available'; END IF;
  IF _job.expires_at IS NOT NULL AND _job.expires_at < now() THEN RAISE EXCEPTION 'LEAD_EXPIRED'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.lead_matches WHERE job_id = _job_id AND professional_id = _pro_id) INTO _matched;
  IF NOT _matched THEN RAISE EXCEPTION 'NOT_MATCHED'; END IF;

  SELECT unlock_cost INTO _cost FROM public.credit_settings WHERE id = 1;

  SELECT id INTO _existing FROM public.lead_unlocks WHERE job_id = _job_id AND professional_id = _pro_id;
  IF _existing IS NULL THEN
    SELECT credit_balance INTO _balance FROM public.professional_credits WHERE professional_id = _pro_id FOR UPDATE;
    IF _balance IS NULL THEN
      INSERT INTO public.professional_credits (professional_id, credit_balance) VALUES (_pro_id, 0);
      _balance := 0;
    END IF;
    IF _balance < _cost THEN RAISE EXCEPTION 'INSUFFICIENT_CREDITS'; END IF;

    UPDATE public.professional_credits SET credit_balance = credit_balance - _cost WHERE professional_id = _pro_id;
    INSERT INTO public.lead_unlocks (job_id, professional_id, credits_used) VALUES (_job_id, _pro_id, _cost);
    INSERT INTO public.credit_transactions (professional_id, amount, transaction_type, description)
      VALUES (_pro_id, -_cost, 'lead_unlock', 'Unlocked lead: ' || _job.title);
  END IF;

  RETURN QUERY
    SELECT _job.id, p.full_name, u.email::TEXT, p.phone, _job.details, _job.title, _job.city, _job.event_date, _job.event_time, _job.budget_band, _cost
    FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = _job.customer_id;
END $$;

CREATE OR REPLACE FUNCTION public.my_unlocked_leads()
RETURNS TABLE(unlock_id uuid, job_id uuid, unlocked_at timestamptz, credits_used integer, title text, city text, event_date date, event_time time, budget_band text, details text, customer_name text, customer_email text, customer_phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT lu.id, j.id, lu.unlocked_at, lu.credits_used, j.title, j.city, j.event_date, j.event_time, j.budget_band, j.details,
         p.full_name, u.email::TEXT, p.phone
  FROM public.lead_unlocks lu
  JOIN public.professionals pr ON pr.id = lu.professional_id AND pr.user_id = auth.uid()
  JOIN public.jobs j ON j.id = lu.job_id
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = p.id
  ORDER BY lu.unlocked_at DESC;
$$;

UPDATE public.credit_settings SET
  unlock_cost = 8,
  welcome_bonus = 5,
  packages = '[
    {"id": "starter", "name": "Starter", "credits": 50, "price_pence": 6000},
    {"id": "growth", "name": "Growth", "credits": 100, "price_pence": 10000},
    {"id": "professional", "name": "Professional", "credits": 200, "price_pence": 15000}
  ]'::jsonb
WHERE id = 1;
