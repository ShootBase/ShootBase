-- PART 2: messages, reviews, jobs, credits

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT, url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif self read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif self update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Jobs
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  kind public.job_kind NOT NULL,
  title TEXT NOT NULL, summary TEXT NOT NULL, details TEXT NOT NULL,
  city TEXT NOT NULL,
  event_date DATE, event_time TIME,
  budget_band TEXT,
  status public.job_status NOT NULL DEFAULT 'open',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  flexible_dates BOOLEAN NOT NULL DEFAULT false,
  duration TEXT CHECK (duration IS NULL OR duration IN ('1-2h','half-day','full-day','multi-day','1h','2h','3h')),
  contact_name TEXT, contact_phone TEXT,
  preferred_contact TEXT CHECK (preferred_contact IS NULL OR preferred_contact IN ('email','phone','either')),
  inspiration_links TEXT[] NOT NULL DEFAULT '{}',
  duration_days int, duration_start_date date, duration_end_date date,
  duration_consecutive boolean, duration_flexible boolean,
  duration_hours numeric,
  urgency_status text NOT NULL DEFAULT 'normal',
  latitude double precision, longitude double precision,
  postcode_prefix text,
  unlock_credit_cost integer,
  max_responses integer NOT NULL DEFAULT 5,
  event_type text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_status_idx ON public.jobs(status);
CREATE INDEX jobs_service_idx ON public.jobs(service_id);
CREATE INDEX jobs_customer_idx ON public.jobs(customer_id);
CREATE INDEX jobs_expires_idx ON public.jobs(expires_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs owner read" ON public.jobs FOR SELECT TO authenticated USING (customer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "jobs owner insert" ON public.jobs FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "jobs owner update" ON public.jobs FOR UPDATE TO authenticated USING (customer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "jobs admin delete" ON public.jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER tg_jobs_updated BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- quote_requests
CREATE TABLE public.quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id),
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  event_date DATE, location TEXT, budget_band TEXT,
  details TEXT NOT NULL,
  status public.quote_status NOT NULL DEFAULT 'pending',
  quoted_price_pence INT,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  reply_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16),'hex'),
  archived_by_pro BOOLEAN NOT NULL DEFAULT false,
  hired BOOLEAN NOT NULL DEFAULT false,
  closed BOOLEAN NOT NULL DEFAULT false,
  client_status TEXT NOT NULL DEFAULT 'new',
  deleted_by_customer BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_by_pro BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX qr_customer_idx ON public.quote_requests(customer_id);
CREATE INDEX qr_pro_idx ON public.quote_requests(professional_id);
CREATE UNIQUE INDEX qr_unique_job_pro_customer ON public.quote_requests(job_id, professional_id, customer_id) WHERE job_id IS NOT NULL;
CREATE INDEX qr_last_message_at_idx ON public.quote_requests(last_message_at DESC NULLS LAST);
GRANT SELECT, INSERT, UPDATE ON public.quote_requests TO authenticated;
GRANT ALL ON public.quote_requests TO service_role;
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qr participants read" ON public.quote_requests FOR SELECT TO authenticated USING (customer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));
CREATE POLICY "qr customer insert" ON public.quote_requests FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "qr participants update" ON public.quote_requests FOR UPDATE TO authenticated USING (customer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));
CREATE TRIGGER tg_qr_updated BEFORE UPDATE ON public.quote_requests FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'web',
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_qr_idx ON public.messages(quote_request_id);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg participants read" ON public.messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.quote_requests q WHERE q.id = quote_request_id AND (q.customer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = q.professional_id AND p.user_id = auth.uid()))));
CREATE POLICY "msg participants insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.quote_requests q WHERE q.id = quote_request_id AND (q.customer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = q.professional_id AND p.user_id = auth.uid()))));
CREATE POLICY "msg recipient mark read" ON public.messages FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.quote_requests q WHERE q.id = quote_request_id AND (q.customer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = q.professional_id AND p.user_id = auth.uid()))));

-- reviews
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL UNIQUE REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  photos TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reviews_pro_idx ON public.reviews(professional_id);
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews public read" ON public.reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "reviews customer insert" ON public.reviews FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid() AND EXISTS (SELECT 1 FROM public.quote_requests q WHERE q.id = quote_request_id AND q.customer_id = auth.uid() AND q.status = 'completed'));

CREATE OR REPLACE FUNCTION public.tg_refresh_pro_rating()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  UPDATE public.professionals p
  SET rating_count = sub.cnt, rating_avg = COALESCE(sub.avg_, 0)
  FROM (SELECT professional_id, COUNT(*) cnt, AVG(rating)::NUMERIC(3,2) avg_ FROM public.reviews WHERE professional_id = COALESCE(NEW.professional_id, OLD.professional_id) GROUP BY professional_id) sub
  WHERE p.id = sub.professional_id;
  RETURN NULL;
END; $fn$;
CREATE TRIGGER tg_reviews_rating AFTER INSERT OR DELETE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_pro_rating();

-- favourites
CREATE TABLE public.favourites (
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, professional_id)
);
GRANT SELECT, INSERT, DELETE ON public.favourites TO authenticated;
GRANT ALL ON public.favourites TO service_role;
ALTER TABLE public.favourites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fav self read" ON public.favourites FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY "fav self insert" ON public.favourites FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "fav self delete" ON public.favourites FOR DELETE TO authenticated USING (customer_id = auth.uid());

-- credit_settings
CREATE TABLE public.credit_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  unlock_cost INTEGER NOT NULL DEFAULT 8,
  welcome_bonus INTEGER NOT NULL DEFAULT 5,
  lead_expiry_days INTEGER NOT NULL DEFAULT 7,
  packages JSONB NOT NULL DEFAULT '[
    {"id":"starter","name":"Starter","credits":50,"price_pence":6000},
    {"id":"growth","name":"Growth","credits":100,"price_pence":10000},
    {"id":"pro_pack","name":"Professional Credits","credits":200,"price_pence":14999,"compare_at_pence":19900,"featured":true,"description":"200 credits to unlock customer leads"}
  ]'::jsonb,
  subscription JSONB NOT NULL DEFAULT '{"price_id":"credits_monthly_sub","name":"Monthly Credits","credits":30,"price_pence":1999,"interval":"month"}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.credit_settings (id) VALUES (1);
GRANT SELECT ON public.credit_settings TO authenticated, anon;
GRANT ALL ON public.credit_settings TO service_role;
ALTER TABLE public.credit_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read all" ON public.credit_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can update credit settings" ON public.credit_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- professional_credits
CREATE TABLE public.professional_credits (
  professional_id UUID PRIMARY KEY REFERENCES public.professionals(id) ON DELETE CASCADE,
  credit_balance INTEGER NOT NULL DEFAULT 0,
  free_credits_used INTEGER NOT NULL DEFAULT 0,
  welcome_bonus_granted BOOLEAN NOT NULL DEFAULT FALSE,
  auto_topup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_topup_last_price_id TEXT,
  auto_topup_in_progress BOOLEAN NOT NULL DEFAULT FALSE,
  auto_topup_in_progress_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.professional_credits TO authenticated;
GRANT ALL ON public.professional_credits TO service_role;
ALTER TABLE public.professional_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credits self read" ON public.professional_credits FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER tg_credits_updated BEFORE UPDATE ON public.professional_credits FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- credit_transactions
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
CREATE UNIQUE INDEX credit_tx_unique_stripe_purchase ON public.credit_transactions(stripe_payment_id) WHERE transaction_type = 'credit_purchase' AND stripe_payment_id IS NOT NULL;
GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit tx self read" ON public.credit_transactions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));

-- credit_subscriptions
CREATE TABLE public.credit_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  price_id TEXT NOT NULL,
  status TEXT NOT NULL,
  credits_per_period INTEGER NOT NULL DEFAULT 30,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX credit_subscriptions_pro_idx ON public.credit_subscriptions(professional_id);
GRANT SELECT ON public.credit_subscriptions TO authenticated;
GRANT ALL ON public.credit_subscriptions TO service_role;
ALTER TABLE public.credit_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subs owner read" ON public.credit_subscriptions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = credit_subscriptions.professional_id AND p.user_id = auth.uid()));
CREATE TRIGGER tg_credit_subscriptions_updated_at BEFORE UPDATE ON public.credit_subscriptions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- lead_unlocks
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
CREATE POLICY "unlocks self read" ON public.lead_unlocks FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));

-- lead_matches
CREATE TABLE public.lead_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, professional_id)
);
CREATE INDEX lead_matches_pro_idx ON public.lead_matches(professional_id, created_at DESC);
CREATE INDEX lead_matches_job_idx ON public.lead_matches(job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_matches TO authenticated;
GRANT ALL ON public.lead_matches TO service_role;
ALTER TABLE public.lead_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_matches self read" ON public.lead_matches FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = lead_matches.professional_id AND p.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "jobs matched pro read" ON public.jobs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.lead_matches lm JOIN public.professionals p ON p.id = lm.professional_id WHERE lm.job_id = jobs.id AND p.user_id = auth.uid()));

-- job_attachments
CREATE TABLE public.job_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_attachments_job_id_idx ON public.job_attachments(job_id);
GRANT SELECT, INSERT, DELETE ON public.job_attachments TO authenticated;
GRANT ALL ON public.job_attachments TO service_role;
ALTER TABLE public.job_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers manage their own job attachments" ON public.job_attachments FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_attachments.job_id AND j.customer_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_attachments.job_id AND j.customer_id = auth.uid()));
CREATE POLICY "Pros who unlocked the lead can view attachments" ON public.job_attachments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.lead_unlocks lu JOIN public.professionals pr ON pr.id = lu.professional_id WHERE lu.job_id = job_attachments.job_id AND pr.user_id = auth.uid()));

-- onboarding_videos
CREATE TABLE public.onboarding_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'How to Build a Profile That Wins More Clients',
  subtitle TEXT NOT NULL DEFAULT 'Learn how to optimise your ShootBase profile to increase visibility, build trust, and receive more enquiries.',
  kind public.onboarding_video_kind NOT NULL DEFAULT 'youtube',
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_label TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.onboarding_videos TO authenticated;
GRANT ALL ON public.onboarding_videos TO service_role;
ALTER TABLE public.onboarding_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read enabled videos" ON public.onboarding_videos FOR SELECT TO authenticated USING (enabled = TRUE OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage videos" ON public.onboarding_videos FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER tg_onboarding_videos_updated_at BEFORE UPDATE ON public.onboarding_videos FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- support_requests
CREATE TABLE public.support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT, email TEXT, role TEXT, category TEXT,
  message TEXT NOT NULL,
  attachment_paths TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.support_requests TO authenticated;
GRANT ALL ON public.support_requests TO service_role;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own support requests" ON public.support_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own support requests" ON public.support_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can read all support requests" ON public.support_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update support requests" ON public.support_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER tg_support_requests_updated_at BEFORE UPDATE ON public.support_requests FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- jobs_public view
CREATE VIEW public.jobs_public WITH (security_invoker=on) AS
  SELECT id, service_id, kind, title, summary, city, event_date, budget_band, status, created_at
  FROM public.jobs WHERE status = 'open';
GRANT SELECT ON public.jobs_public TO authenticated, anon;

-- Realtime publications
DO $do$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.quote_requests; EXCEPTION WHEN duplicate_object THEN NULL; END $do$;