
-- Countries reference table
CREATE TABLE IF NOT EXISTS public.platform_countries (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_countries TO authenticated, anon;
GRANT ALL ON public.platform_countries TO service_role;
ALTER TABLE public.platform_countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_countries readable" ON public.platform_countries;
CREATE POLICY "platform_countries readable" ON public.platform_countries FOR SELECT USING (true);

INSERT INTO public.platform_countries (code, name) VALUES
  ('GB','United Kingdom'), ('NG','Nigeria')
ON CONFLICT (code) DO NOTHING;

-- staff_accounts.country (NULL = global)
ALTER TABLE public.staff_accounts ADD COLUMN IF NOT EXISTS country TEXT;
UPDATE public.staff_accounts SET country = 'United Kingdom'
  WHERE country IS NULL AND role <> 'super_admin';

-- Country columns
ALTER TABLE public.profiles            ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'United Kingdom';
ALTER TABLE public.jobs                ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'United Kingdom';
ALTER TABLE public.support_requests    ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'United Kingdom';
ALTER TABLE public.invoices            ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'United Kingdom';
ALTER TABLE public.lead_reports        ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'United Kingdom';
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'United Kingdom';
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'United Kingdom';
ALTER TABLE public.admin_notes         ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'United Kingdom';

-- Backfill
UPDATE public.profiles p SET country = pr.country
  FROM public.professionals pr
  WHERE pr.user_id = p.id AND pr.country IS NOT NULL AND pr.country <> p.country;

UPDATE public.jobs j SET country = COALESCE(p.country,'United Kingdom')
  FROM public.profiles p WHERE p.id = j.customer_id AND p.country <> j.country;

UPDATE public.invoices i SET country = COALESCE(pr.country,'United Kingdom')
  FROM public.professionals pr WHERE pr.user_id = i.user_id AND pr.country <> i.country;

UPDATE public.lead_reports r SET country = j.country
  FROM public.jobs j WHERE j.id = r.job_id AND j.country <> r.country;

UPDATE public.credit_transactions t SET country = pr.country
  FROM public.professionals pr WHERE pr.id = t.professional_id AND pr.country <> t.country;

UPDATE public.support_requests s SET country = COALESCE(p.country,'United Kingdom')
  FROM public.profiles p WHERE p.id = s.user_id AND p.country <> s.country;

UPDATE public.admin_notes n SET country = s.country
  FROM public.support_requests s WHERE s.id = n.support_request_id AND s.country <> n.country;

UPDATE public.admin_notifications n SET country = COALESCE(
  (SELECT country FROM public.support_requests WHERE id = n.related_ticket_id),
  (SELECT country FROM public.lead_reports     WHERE id = n.related_report_id),
  (SELECT country FROM public.jobs             WHERE id = n.related_job_id),
  'United Kingdom'
);

CREATE INDEX IF NOT EXISTS jobs_country_idx                ON public.jobs(country);
CREATE INDEX IF NOT EXISTS support_requests_country_idx    ON public.support_requests(country);
CREATE INDEX IF NOT EXISTS invoices_country_idx            ON public.invoices(country);
CREATE INDEX IF NOT EXISTS lead_reports_country_idx        ON public.lead_reports(country);
CREATE INDEX IF NOT EXISTS admin_notifications_country_idx ON public.admin_notifications(country);
CREATE INDEX IF NOT EXISTS credit_transactions_country_idx ON public.credit_transactions(country);
CREATE INDEX IF NOT EXISTS admin_notes_country_idx         ON public.admin_notes(country);
CREATE INDEX IF NOT EXISTS profiles_country_idx            ON public.profiles(country);

-- Triggers to auto-set country on insert
CREATE OR REPLACE FUNCTION public.tg_set_job_country() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = 'United Kingdom' THEN
    SELECT COALESCE(p.country,'United Kingdom') INTO NEW.country
      FROM public.profiles p WHERE p.id = NEW.customer_id;
    NEW.country := COALESCE(NEW.country,'United Kingdom');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS jobs_set_country ON public.jobs;
CREATE TRIGGER jobs_set_country BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_job_country();

CREATE OR REPLACE FUNCTION public.tg_set_invoice_country() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = 'United Kingdom' THEN
    SELECT COALESCE(pr.country,'United Kingdom') INTO NEW.country
      FROM public.professionals pr WHERE pr.user_id = NEW.user_id LIMIT 1;
    NEW.country := COALESCE(NEW.country,'United Kingdom');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoices_set_country ON public.invoices;
CREATE TRIGGER invoices_set_country BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_invoice_country();

CREATE OR REPLACE FUNCTION public.tg_set_lead_report_country() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  SELECT country INTO NEW.country FROM public.jobs WHERE id = NEW.job_id;
  NEW.country := COALESCE(NEW.country,'United Kingdom');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lead_reports_set_country ON public.lead_reports;
CREATE TRIGGER lead_reports_set_country BEFORE INSERT ON public.lead_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_lead_report_country();

CREATE OR REPLACE FUNCTION public.tg_set_credit_tx_country() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.professional_id IS NOT NULL THEN
    SELECT country INTO NEW.country FROM public.professionals WHERE id = NEW.professional_id;
  END IF;
  NEW.country := COALESCE(NEW.country,'United Kingdom');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS credit_tx_set_country ON public.credit_transactions;
CREATE TRIGGER credit_tx_set_country BEFORE INSERT ON public.credit_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_credit_tx_country();

CREATE OR REPLACE FUNCTION public.tg_set_support_request_country() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = 'United Kingdom' THEN
    SELECT COALESCE(p.country,'United Kingdom') INTO NEW.country
      FROM public.profiles p WHERE p.id = NEW.user_id;
    NEW.country := COALESCE(NEW.country,'United Kingdom');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS support_requests_set_country ON public.support_requests;
CREATE TRIGGER support_requests_set_country BEFORE INSERT ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_support_request_country();

CREATE OR REPLACE FUNCTION public.tg_set_admin_note_country() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  SELECT country INTO NEW.country FROM public.support_requests WHERE id = NEW.support_request_id;
  NEW.country := COALESCE(NEW.country,'United Kingdom');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS admin_notes_set_country ON public.admin_notes;
CREATE TRIGGER admin_notes_set_country BEFORE INSERT ON public.admin_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_admin_note_country();

CREATE OR REPLACE FUNCTION public.tg_sync_profile_country_from_pro() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.country IS NOT NULL THEN
    UPDATE public.profiles SET country = NEW.country WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS professionals_sync_profile_country ON public.professionals;
CREATE TRIGGER professionals_sync_profile_country
  AFTER INSERT OR UPDATE OF country ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_profile_country_from_pro();

-- Helper functions
CREATE OR REPLACE FUNCTION public.staff_country(_uid uuid)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT country FROM public.staff_accounts WHERE user_id = _uid AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.staff_can_see_country(_uid uuid, _country text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r public.staff_role; _c text;
BEGIN
  SELECT role, country INTO _r, _c FROM public.staff_accounts WHERE user_id = _uid AND status = 'active';
  IF _r IS NULL THEN RETURN false; END IF;
  IF _r = 'super_admin' OR _c IS NULL THEN RETURN true; END IF;
  RETURN _c = _country;
END $$;

CREATE OR REPLACE FUNCTION public.assert_country_access(_country text)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.staff_can_see_country(auth.uid(), _country) THEN
    RAISE EXCEPTION 'country_forbidden';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.staff_country(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_can_see_country(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assert_country_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_country(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_can_see_country(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_country_access(text) TO authenticated;

-- Update default permission set to include country_admin
CREATE OR REPLACE FUNCTION public.staff_role_default_permissions(_role staff_role)
RETURNS staff_permission[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE _role
    WHEN 'super_admin' THEN ARRAY[
      'users.view','users.edit','users.suspend','users.delete',
      'tickets.view','tickets.reply','tickets.manage',
      'coins.view','coins.adjust','coins.refund',
      'leads.manage','verification.manage',
      'staff.manage','settings.manage','audit.view',
      'analytics.view','notifications.view'
    ]::public.staff_permission[]
    WHEN 'country_admin' THEN ARRAY[
      'users.view','users.edit','users.suspend',
      'tickets.view','tickets.reply','tickets.manage',
      'coins.view','coins.adjust','coins.refund',
      'leads.manage','verification.manage','audit.view',
      'analytics.view','notifications.view'
    ]::public.staff_permission[]
    WHEN 'admin' THEN ARRAY[
      'users.view','users.edit','users.suspend',
      'tickets.view','tickets.reply','tickets.manage',
      'leads.manage','verification.manage','audit.view',
      'analytics.view','notifications.view'
    ]::public.staff_permission[]
    WHEN 'team_member' THEN ARRAY[
      'tickets.view','tickets.reply','tickets.manage',
      'analytics.view','notifications.view'
    ]::public.staff_permission[]
    WHEN 'support_agent' THEN ARRAY[
      'users.view','tickets.view','tickets.reply'
    ]::public.staff_permission[]
    WHEN 'moderator' THEN ARRAY[
      'users.view','users.suspend','leads.manage','verification.manage'
    ]::public.staff_permission[]
    WHEN 'finance_manager' THEN ARRAY[
      'users.view','coins.view','coins.adjust','coins.refund'
    ]::public.staff_permission[]
    ELSE ARRAY[]::public.staff_permission[]
  END;
$$;

-- Refresh admin_get_lead_reports with country check
CREATE OR REPLACE FUNCTION public.admin_get_lead_reports(_job_id uuid)
RETURNS TABLE(id uuid, professional_id uuid, business_name text, reason text, notes text,
              attempted_call boolean, attempted_sms boolean, status text,
              credits_refunded_amount integer, created_at timestamptz, resolved_at timestamptz,
              resolution_note text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _job_country text;
BEGIN
  IF NOT public.has_staff_permission(auth.uid(), 'users.edit'::public.staff_permission)
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT country INTO _job_country FROM public.jobs WHERE id = _job_id;
  PERFORM public.assert_country_access(COALESCE(_job_country,'United Kingdom'));
  RETURN QUERY
  SELECT r.id, r.professional_id, pr.business_name,
         r.reason, r.notes, r.attempted_call, r.attempted_sms,
         r.status, r.credits_refunded_amount,
         r.created_at, r.resolved_at, r.resolution_note
  FROM public.lead_reports r
  LEFT JOIN public.professionals pr ON pr.id = r.professional_id
  WHERE r.job_id = _job_id
  ORDER BY r.created_at DESC;
END $$;
