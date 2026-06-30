
-- ============ ENUMS ============
CREATE TYPE public.credit_tx_type AS ENUM ('welcome_bonus','credit_purchase','lead_unlock','refund','admin_adjustment');
CREATE TYPE public.job_status AS ENUM ('open','closed','expired');
CREATE TYPE public.job_kind AS ENUM ('photography','videography');

-- ============ JOBS ============
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  kind public.job_kind NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT NOT NULL,
  city TEXT NOT NULL,
  event_date DATE,
  budget_band TEXT,
  status public.job_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_status_idx ON public.jobs(status);
CREATE INDEX jobs_service_idx ON public.jobs(service_id);
CREATE INDEX jobs_customer_idx ON public.jobs(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs owner read" ON public.jobs FOR SELECT TO authenticated USING (customer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "jobs owner insert" ON public.jobs FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "jobs owner update" ON public.jobs FOR UPDATE TO authenticated USING (customer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "jobs admin delete" ON public.jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER tg_jobs_updated BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ PROFESSIONAL CREDITS ============
CREATE TABLE public.professional_credits (
  professional_id UUID PRIMARY KEY REFERENCES public.professionals(id) ON DELETE CASCADE,
  credit_balance INTEGER NOT NULL DEFAULT 0,
  free_credits_used INTEGER NOT NULL DEFAULT 0,
  welcome_bonus_granted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.professional_credits TO authenticated;
GRANT ALL ON public.professional_credits TO service_role;
ALTER TABLE public.professional_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credits self read" ON public.professional_credits FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER tg_credits_updated BEFORE UPDATE ON public.professional_credits FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ CREDIT TRANSACTIONS ============
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  transaction_type public.credit_tx_type NOT NULL,
  description TEXT,
  stripe_payment_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX credit_tx_pro_idx ON public.credit_transactions(professional_id, created_at DESC);
GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit tx self read" ON public.credit_transactions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));

-- ============ LEAD UNLOCKS ============
CREATE TABLE public.lead_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  credits_used INTEGER NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, professional_id)
);
CREATE INDEX lead_unlocks_pro_idx ON public.lead_unlocks(professional_id, unlocked_at DESC);
GRANT SELECT ON public.lead_unlocks TO authenticated;
GRANT ALL ON public.lead_unlocks TO service_role;
ALTER TABLE public.lead_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unlocks self read" ON public.lead_unlocks FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));

-- ============ CREDIT SETTINGS ============
CREATE TABLE public.credit_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  unlock_cost INTEGER NOT NULL DEFAULT 8,
  welcome_bonus INTEGER NOT NULL DEFAULT 5,
  packages JSONB NOT NULL DEFAULT '[
    {"id":"starter","name":"Starter","credits":50,"price_pence":6000},
    {"id":"growth","name":"Growth","credits":100,"price_pence":10000},
    {"id":"professional","name":"Professional","credits":200,"price_pence":15000}
  ]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.credit_settings (id) VALUES (1);
GRANT SELECT ON public.credit_settings TO authenticated, anon;
GRANT ALL ON public.credit_settings TO service_role;
ALTER TABLE public.credit_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read all" ON public.credit_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "settings admin update" ON public.credit_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ PUBLIC VIEW (safe job columns) ============
CREATE VIEW public.jobs_public WITH (security_invoker=on) AS
  SELECT id, service_id, kind, title, summary, city, event_date, budget_band, status, created_at
  FROM public.jobs WHERE status = 'open';
GRANT SELECT ON public.jobs_public TO authenticated, anon;

-- ============ UNLOCK RPC (atomic) ============
CREATE OR REPLACE FUNCTION public.unlock_job(_job_id UUID)
RETURNS TABLE (
  job_id UUID, customer_name TEXT, customer_email TEXT, customer_phone TEXT,
  details TEXT, title TEXT, city TEXT, event_date DATE, budget_band TEXT, credits_used INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _pro_id UUID;
  _balance INTEGER;
  _cost INTEGER;
  _existing UUID;
  _job RECORD;
BEGIN
  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = auth.uid();
  IF _pro_id IS NULL THEN RAISE EXCEPTION 'Not a professional'; END IF;

  SELECT * INTO _job FROM public.jobs WHERE id = _job_id AND status = 'open';
  IF _job IS NULL THEN RAISE EXCEPTION 'Job not available'; END IF;

  SELECT cost INTO _cost FROM (SELECT unlock_cost AS cost FROM public.credit_settings WHERE id = 1) s;

  -- Already unlocked? Re-return without charging.
  SELECT id INTO _existing FROM public.lead_unlocks WHERE job_id = _job_id AND professional_id = _pro_id;

  IF _existing IS NULL THEN
    -- Lock the credits row to prevent concurrent double-spend
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
    SELECT _job.id, p.full_name, u.email::TEXT, p.phone, _job.details, _job.title, _job.city, _job.event_date, _job.budget_band, _cost
    FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = _job.customer_id;
END $$;

REVOKE ALL ON FUNCTION public.unlock_job(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_job(UUID) TO authenticated;

-- ============ UNLOCKED LEADS LIST RPC ============
CREATE OR REPLACE FUNCTION public.my_unlocked_leads()
RETURNS TABLE (
  unlock_id UUID, job_id UUID, unlocked_at TIMESTAMPTZ, credits_used INTEGER,
  title TEXT, city TEXT, event_date DATE, budget_band TEXT, details TEXT,
  customer_name TEXT, customer_email TEXT, customer_phone TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT lu.id, j.id, lu.unlocked_at, lu.credits_used, j.title, j.city, j.event_date, j.budget_band, j.details,
         p.full_name, u.email::TEXT, p.phone
  FROM public.lead_unlocks lu
  JOIN public.professionals pr ON pr.id = lu.professional_id AND pr.user_id = auth.uid()
  JOIN public.jobs j ON j.id = lu.job_id
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = p.id
  ORDER BY lu.unlocked_at DESC;
$$;
REVOKE ALL ON FUNCTION public.my_unlocked_leads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_unlocked_leads() TO authenticated;

-- ============ WELCOME BONUS TRIGGER ============
CREATE OR REPLACE FUNCTION public.tg_grant_welcome_credits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bonus INTEGER;
BEGIN
  SELECT welcome_bonus INTO _bonus FROM public.credit_settings WHERE id = 1;
  INSERT INTO public.professional_credits (professional_id, credit_balance, welcome_bonus_granted)
    VALUES (NEW.id, _bonus, TRUE)
    ON CONFLICT (professional_id) DO NOTHING;
  INSERT INTO public.credit_transactions (professional_id, amount, transaction_type, description)
    VALUES (NEW.id, _bonus, 'welcome_bonus', 'Welcome! You have received ' || _bonus || ' free credits to contact your first customers.');
  RETURN NEW;
END $$;

CREATE TRIGGER tg_pro_welcome AFTER INSERT ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.tg_grant_welcome_credits();

-- Backfill credits row for any existing professionals
INSERT INTO public.professional_credits (professional_id, credit_balance, welcome_bonus_granted)
SELECT id, 5, TRUE FROM public.professionals
ON CONFLICT (professional_id) DO NOTHING;

INSERT INTO public.credit_transactions (professional_id, amount, transaction_type, description)
SELECT id, 5, 'welcome_bonus', 'Welcome bonus (backfill)' FROM public.professionals
WHERE NOT EXISTS (SELECT 1 FROM public.credit_transactions ct WHERE ct.professional_id = professionals.id AND ct.transaction_type = 'welcome_bonus');

-- ============ JOB NOTIFICATIONS ============
CREATE OR REPLACE FUNCTION public.tg_notify_pros_on_new_job()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'open' AND NEW.service_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, url)
    SELECT DISTINCT pr.user_id,
      'New ' || NEW.title || ' enquiry',
      'New lead in ' || NEW.city || '. Unlock this customer for credits.',
      '/pro/dashboard'
    FROM public.professional_services ps
    JOIN public.professionals pr ON pr.id = ps.professional_id AND pr.status = 'active'
    WHERE ps.service_id = NEW.service_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_jobs_notify AFTER INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.tg_notify_pros_on_new_job();
