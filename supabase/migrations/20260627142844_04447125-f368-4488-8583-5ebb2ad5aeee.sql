
-- ============================================================
-- 1. ADD country TO REMAINING TABLES
-- ============================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'messages','quote_requests','reviews','review_replies','review_reports',
    'credit_subscriptions','notifications','lead_match_notifications',
    'lead_unlocks','pro_contact_requests','favourites','pro_lead_favourites',
    'pro_lead_views','pro_lead_dismissals','job_attachments',
    'message_attachments','message_email_notifications','lead_report_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT ''United Kingdom''', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (country)', t||'_country_idx', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 2. BACKFILL NULLS
-- ============================================================
UPDATE public.profiles            SET country = 'United Kingdom' WHERE country IS NULL;
UPDATE public.jobs                SET country = 'United Kingdom' WHERE country IS NULL;
UPDATE public.professionals       SET country = 'United Kingdom' WHERE country IS NULL;
UPDATE public.invoices            SET country = 'United Kingdom' WHERE country IS NULL;
UPDATE public.credit_transactions SET country = 'United Kingdom' WHERE country IS NULL;
UPDATE public.support_requests    SET country = 'United Kingdom' WHERE country IS NULL;
UPDATE public.lead_reports        SET country = 'United Kingdom' WHERE country IS NULL;
UPDATE public.admin_notes         SET country = 'United Kingdom' WHERE country IS NULL;
UPDATE public.admin_notifications SET country = 'United Kingdom' WHERE country IS NULL;
UPDATE public.staff_accounts      SET country = 'United Kingdom' WHERE country IS NULL AND role <> 'super_admin';

-- ============================================================
-- 3. HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_country(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(country, 'United Kingdom') FROM public.profiles WHERE id = _uid $$;

CREATE OR REPLACE FUNCTION public.same_country(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.user_country(_a) = public.user_country(_b) $$;

GRANT EXECUTE ON FUNCTION public.user_country(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.same_country(uuid, uuid) TO authenticated;

-- ============================================================
-- 4. SIGNUP TRIGGER — read country from auth metadata
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _country text;
BEGIN
  _country := COALESCE(NULLIF(NEW.raw_user_meta_data->>'country', ''), 'United Kingdom');
  INSERT INTO public.profiles (id, full_name, avatar_url, verified, country)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    public.compute_user_verified(NEW),
    _country
  )
  ON CONFLICT (id) DO UPDATE SET verified = EXCLUDED.verified;
  RETURN NEW;
END $$;

-- ============================================================
-- 5. AUTO-POPULATE TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_country_from_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _col text;
BEGIN
  IF NEW.country IS NOT NULL AND NEW.country <> 'United Kingdom' THEN RETURN NEW; END IF;
  _col := TG_ARGV[0];
  EXECUTE format('SELECT ($1).%I', _col) INTO _uid USING NEW;
  IF _uid IS NOT NULL THEN
    NEW.country := COALESCE(public.user_country(_uid), 'United Kingdom');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_country_from_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = 'United Kingdom' THEN
    SELECT COALESCE(country, 'United Kingdom') INTO NEW.country FROM public.jobs WHERE id = NEW.job_id;
    NEW.country := COALESCE(NEW.country, 'United Kingdom');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_country_from_pro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = 'United Kingdom' THEN
    SELECT COALESCE(country, 'United Kingdom') INTO NEW.country FROM public.professionals WHERE id = NEW.professional_id;
    NEW.country := COALESCE(NEW.country, 'United Kingdom');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS jobs_set_country ON public.jobs;
CREATE TRIGGER jobs_set_country BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_country_from_user('customer_id');

DROP TRIGGER IF EXISTS pros_set_country ON public.professionals;
CREATE TRIGGER pros_set_country BEFORE INSERT ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.set_country_from_user('user_id');

DROP TRIGGER IF EXISTS qr_set_country ON public.quote_requests;
CREATE TRIGGER qr_set_country BEFORE INSERT ON public.quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_country_from_job();

DROP TRIGGER IF EXISTS messages_set_country ON public.messages;
CREATE TRIGGER messages_set_country BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.set_country_from_user('sender_id');

DROP TRIGGER IF EXISTS reviews_set_country ON public.reviews;
CREATE TRIGGER reviews_set_country BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_country_from_user('customer_id');

DROP TRIGGER IF EXISTS credit_subs_set_country ON public.credit_subscriptions;
CREATE TRIGGER credit_subs_set_country BEFORE INSERT ON public.credit_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_country_from_pro();

DROP TRIGGER IF EXISTS notifications_set_country ON public.notifications;
CREATE TRIGGER notifications_set_country BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_country_from_user('user_id');

DROP TRIGGER IF EXISTS lead_unlocks_set_country ON public.lead_unlocks;
CREATE TRIGGER lead_unlocks_set_country BEFORE INSERT ON public.lead_unlocks
  FOR EACH ROW EXECUTE FUNCTION public.set_country_from_job();

DROP TRIGGER IF EXISTS lead_match_set_country ON public.lead_match_notifications;
CREATE TRIGGER lead_match_set_country BEFORE INSERT ON public.lead_match_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_country_from_job();

DROP TRIGGER IF EXISTS pcr_set_country ON public.pro_contact_requests;
CREATE TRIGGER pcr_set_country BEFORE INSERT ON public.pro_contact_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_country_from_user('customer_id');

-- ============================================================
-- 6. BACKFILL just-added columns from owners
-- ============================================================
UPDATE public.messages m SET country = COALESCE(public.user_country(m.sender_id),'United Kingdom') WHERE country = 'United Kingdom';
UPDATE public.quote_requests qr SET country = COALESCE((SELECT country FROM public.jobs WHERE id = qr.job_id),'United Kingdom') WHERE country = 'United Kingdom';
UPDATE public.reviews r SET country = COALESCE(public.user_country(r.customer_id),'United Kingdom') WHERE country = 'United Kingdom';
UPDATE public.notifications n SET country = COALESCE(public.user_country(n.user_id),'United Kingdom') WHERE country = 'United Kingdom';
UPDATE public.lead_unlocks lu SET country = COALESCE((SELECT country FROM public.jobs WHERE id = lu.job_id),'United Kingdom') WHERE country = 'United Kingdom';
UPDATE public.lead_match_notifications lm SET country = COALESCE((SELECT country FROM public.jobs WHERE id = lm.job_id),'United Kingdom') WHERE country = 'United Kingdom';
UPDATE public.credit_subscriptions cs SET country = COALESCE((SELECT country FROM public.professionals WHERE id = cs.professional_id),'United Kingdom') WHERE country = 'United Kingdom';
UPDATE public.pro_contact_requests pcr SET country = COALESCE(public.user_country(pcr.customer_id),'United Kingdom') WHERE country = 'United Kingdom';

-- ============================================================
-- 7. RLS — country isolation for end users
-- ============================================================
DROP POLICY IF EXISTS "jobs unlocked pro read" ON public.jobs;
CREATE POLICY "jobs unlocked pro read" ON public.jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lead_unlocks lu
      JOIN public.professionals p ON p.id = lu.professional_id
      WHERE lu.job_id = jobs.id
        AND p.user_id = auth.uid()
        AND COALESCE(p.country,'United Kingdom') = COALESCE(jobs.country,'United Kingdom')
    )
  );

DROP POLICY IF EXISTS "pros public read active" ON public.professionals;
DROP POLICY IF EXISTS "pros same-country read active" ON public.professionals;
CREATE POLICY "pros same-country read active" ON public.professionals FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      status = 'active'::pro_status
      AND (
        auth.uid() IS NULL
        OR COALESCE(country,'United Kingdom') = COALESCE(public.user_country(auth.uid()),'United Kingdom')
      )
    )
  );
