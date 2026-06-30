
-- ============================================================
-- Phase A — Country isolation tightening
-- ============================================================

-- ---------- 1. Add country column to user_risk_scores ----------
ALTER TABLE public.user_risk_scores ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'United Kingdom';
CREATE INDEX IF NOT EXISTS user_risk_scores_country_idx ON public.user_risk_scores(country);

UPDATE public.user_risk_scores urs
   SET country = COALESCE(p.country, 'United Kingdom')
  FROM public.profiles p
 WHERE p.id = urs.user_id AND (urs.country IS NULL OR urs.country = 'United Kingdom');

-- ---------- 2. Generic country-from-parent trigger functions ----------

-- From an attached job_id column
CREATE OR REPLACE FUNCTION public.tg_country_from_job_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = 'United Kingdom' THEN
    SELECT COALESCE(country,'United Kingdom') INTO NEW.country FROM public.jobs WHERE id = NEW.job_id;
    NEW.country := COALESCE(NEW.country,'United Kingdom');
  END IF;
  RETURN NEW;
END $$;

-- From an attached professional_id column
CREATE OR REPLACE FUNCTION public.tg_country_from_pro_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = 'United Kingdom' THEN
    SELECT COALESCE(country,'United Kingdom') INTO NEW.country FROM public.professionals WHERE id = NEW.professional_id;
    NEW.country := COALESCE(NEW.country,'United Kingdom');
  END IF;
  RETURN NEW;
END $$;

-- From an attached customer_id (auth.users / profiles)
CREATE OR REPLACE FUNCTION public.tg_country_from_customer_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = 'United Kingdom' THEN
    SELECT COALESCE(country,'United Kingdom') INTO NEW.country FROM public.profiles WHERE id = NEW.customer_id;
    NEW.country := COALESCE(NEW.country,'United Kingdom');
  END IF;
  RETURN NEW;
END $$;

-- From an attached user_id (auth.users / profiles)
CREATE OR REPLACE FUNCTION public.tg_country_from_user_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = 'United Kingdom' THEN
    SELECT COALESCE(country,'United Kingdom') INTO NEW.country FROM public.profiles WHERE id = NEW.user_id;
    NEW.country := COALESCE(NEW.country,'United Kingdom');
  END IF;
  RETURN NEW;
END $$;

-- From an attached review_id
CREATE OR REPLACE FUNCTION public.tg_country_from_review_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = 'United Kingdom' THEN
    SELECT COALESCE(country,'United Kingdom') INTO NEW.country FROM public.reviews WHERE id = NEW.review_id;
    NEW.country := COALESCE(NEW.country,'United Kingdom');
  END IF;
  RETURN NEW;
END $$;

-- From an attached message_id
CREATE OR REPLACE FUNCTION public.tg_country_from_message_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = 'United Kingdom' THEN
    SELECT COALESCE(country,'United Kingdom') INTO NEW.country FROM public.messages WHERE id = NEW.message_id;
    NEW.country := COALESCE(NEW.country,'United Kingdom');
  END IF;
  RETURN NEW;
END $$;

-- From an attached report_id (lead_reports)
CREATE OR REPLACE FUNCTION public.tg_country_from_report_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = 'United Kingdom' THEN
    SELECT COALESCE(country,'United Kingdom') INTO NEW.country FROM public.lead_reports WHERE id = NEW.report_id;
    NEW.country := COALESCE(NEW.country,'United Kingdom');
  END IF;
  RETURN NEW;
END $$;

-- Admin notification: derive from any related FK
CREATE OR REPLACE FUNCTION public.tg_set_admin_notification_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_country text;
BEGIN
  IF NEW.country IS NOT NULL AND NEW.country <> 'United Kingdom' THEN RETURN NEW; END IF;
  -- explicit metadata wins
  IF NEW.metadata ? 'country' THEN
    NEW.country := NEW.metadata->>'country'; RETURN NEW;
  END IF;
  -- prefer related job
  IF NEW.related_job_id IS NOT NULL THEN
    SELECT country INTO v_country FROM public.jobs WHERE id = NEW.related_job_id;
    IF v_country IS NOT NULL THEN NEW.country := v_country; RETURN NEW; END IF;
  END IF;
  -- ticket
  IF NEW.related_ticket_id IS NOT NULL THEN
    SELECT country INTO v_country FROM public.support_requests WHERE id = NEW.related_ticket_id;
    IF v_country IS NOT NULL THEN NEW.country := v_country; RETURN NEW; END IF;
  END IF;
  -- lead_report
  IF NEW.related_report_id IS NOT NULL THEN
    SELECT country INTO v_country FROM public.lead_reports WHERE id = NEW.related_report_id;
    IF v_country IS NOT NULL THEN NEW.country := v_country; RETURN NEW; END IF;
  END IF;
  -- lead
  IF NEW.related_lead_id IS NOT NULL THEN
    SELECT country INTO v_country FROM public.jobs WHERE id = NEW.related_lead_id;
    IF v_country IS NOT NULL THEN NEW.country := v_country; RETURN NEW; END IF;
  END IF;
  -- source user
  IF NEW.source_user_id IS NOT NULL THEN
    SELECT country INTO v_country FROM public.profiles WHERE id = NEW.source_user_id;
    IF v_country IS NOT NULL THEN NEW.country := v_country; RETURN NEW; END IF;
  END IF;
  NEW.country := COALESCE(NEW.country,'United Kingdom');
  RETURN NEW;
END $$;

-- ---------- 3. Attach BEFORE INSERT triggers for auto-stamping ----------

DROP TRIGGER IF EXISTS user_risk_scores_set_country ON public.user_risk_scores;
CREATE TRIGGER user_risk_scores_set_country BEFORE INSERT OR UPDATE ON public.user_risk_scores
  FOR EACH ROW EXECUTE FUNCTION public.tg_country_from_user_id();

DROP TRIGGER IF EXISTS admin_notifications_set_country ON public.admin_notifications;
CREATE TRIGGER admin_notifications_set_country BEFORE INSERT ON public.admin_notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_admin_notification_country();

DROP TRIGGER IF EXISTS bank_transfer_requests_set_country ON public.bank_transfer_requests;
CREATE TRIGGER bank_transfer_requests_set_country BEFORE INSERT ON public.bank_transfer_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_country_from_pro_id();

DROP TRIGGER IF EXISTS favourites_set_country ON public.favourites;
CREATE TRIGGER favourites_set_country BEFORE INSERT ON public.favourites
  FOR EACH ROW EXECUTE FUNCTION public.tg_country_from_customer_id();

DROP TRIGGER IF EXISTS job_attachments_set_country ON public.job_attachments;
CREATE TRIGGER job_attachments_set_country BEFORE INSERT ON public.job_attachments
  FOR EACH ROW EXECUTE FUNCTION public.tg_country_from_job_id();

DROP TRIGGER IF EXISTS message_attachments_set_country ON public.message_attachments;
CREATE TRIGGER message_attachments_set_country BEFORE INSERT ON public.message_attachments
  FOR EACH ROW EXECUTE FUNCTION public.tg_country_from_message_id();

DROP TRIGGER IF EXISTS message_email_notifications_set_country ON public.message_email_notifications;
CREATE TRIGGER message_email_notifications_set_country BEFORE INSERT ON public.message_email_notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_country_from_message_id();

DROP TRIGGER IF EXISTS lead_report_events_set_country ON public.lead_report_events;
CREATE TRIGGER lead_report_events_set_country BEFORE INSERT ON public.lead_report_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_country_from_report_id();

DROP TRIGGER IF EXISTS pro_lead_views_set_country ON public.pro_lead_views;
CREATE TRIGGER pro_lead_views_set_country BEFORE INSERT ON public.pro_lead_views
  FOR EACH ROW EXECUTE FUNCTION public.tg_country_from_pro_id();

DROP TRIGGER IF EXISTS pro_lead_favourites_set_country ON public.pro_lead_favourites;
CREATE TRIGGER pro_lead_favourites_set_country BEFORE INSERT ON public.pro_lead_favourites
  FOR EACH ROW EXECUTE FUNCTION public.tg_country_from_pro_id();

DROP TRIGGER IF EXISTS pro_lead_dismissals_set_country ON public.pro_lead_dismissals;
CREATE TRIGGER pro_lead_dismissals_set_country BEFORE INSERT ON public.pro_lead_dismissals
  FOR EACH ROW EXECUTE FUNCTION public.tg_country_from_pro_id();

DROP TRIGGER IF EXISTS review_replies_set_country ON public.review_replies;
CREATE TRIGGER review_replies_set_country BEFORE INSERT ON public.review_replies
  FOR EACH ROW EXECUTE FUNCTION public.tg_country_from_review_id();

DROP TRIGGER IF EXISTS review_reports_set_country ON public.review_reports;
CREATE TRIGGER review_reports_set_country BEFORE INSERT ON public.review_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_country_from_review_id();

-- ---------- 4. Backfill country values for existing rows ----------

UPDATE public.admin_notifications n
   SET country = COALESCE(
     CASE WHEN n.metadata ? 'country' THEN n.metadata->>'country' END,
     (SELECT country FROM public.jobs j WHERE j.id IN (n.related_job_id, n.related_lead_id) LIMIT 1),
     (SELECT country FROM public.support_requests sr WHERE sr.id = n.related_ticket_id),
     (SELECT country FROM public.lead_reports lr WHERE lr.id = n.related_report_id),
     (SELECT country FROM public.profiles p WHERE p.id = n.source_user_id),
     'United Kingdom'
   )
 WHERE n.country IS NULL OR n.country = 'United Kingdom';

UPDATE public.bank_transfer_requests b
   SET country = COALESCE((SELECT country FROM public.professionals pr WHERE pr.id = b.professional_id), 'Nigeria')
 WHERE b.country IS NULL;

UPDATE public.message_email_notifications men
   SET country = COALESCE((SELECT country FROM public.messages m WHERE m.id = men.message_id), 'United Kingdom')
 WHERE men.country IS NULL OR men.country = 'United Kingdom';

-- ---------- 5. Tighten staff/admin RLS policies (country-scoped) ----------

-- admin_notifications
DROP POLICY IF EXISTS "Staff can view admin notifications" ON public.admin_notifications;
CREATE POLICY "Staff can view admin notifications" ON public.admin_notifications
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND public.staff_can_see_country(auth.uid(), country));

DROP POLICY IF EXISTS "Staff can update admin notifications" ON public.admin_notifications;
CREATE POLICY "Staff can update admin notifications" ON public.admin_notifications
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND public.staff_can_see_country(auth.uid(), country))
  WITH CHECK (public.is_staff(auth.uid()) AND public.staff_can_see_country(auth.uid(), country));

-- bank_transfer_requests
DROP POLICY IF EXISTS "admins read all bank transfers" ON public.bank_transfer_requests;
CREATE POLICY "admins read all bank transfers" ON public.bank_transfer_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.staff_can_see_country(auth.uid(), country));

DROP POLICY IF EXISTS "admins update bank transfers" ON public.bank_transfer_requests;
CREATE POLICY "admins update bank transfers" ON public.bank_transfer_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.staff_can_see_country(auth.uid(), country))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.staff_can_see_country(auth.uid(), country));

-- lead_reports
DROP POLICY IF EXISTS "lead_reports owner read" ON public.lead_reports;
CREATE POLICY "lead_reports owner read" ON public.lead_reports
  FOR SELECT TO authenticated
  USING (
    reporter_user_id = auth.uid()
    OR (
      (public.has_staff_permission(auth.uid(), 'users.edit'::public.staff_permission)
        OR public.has_role(auth.uid(), 'admin'::public.app_role))
      AND public.staff_can_see_country(auth.uid(), country)
    )
  );

-- support_requests
DROP POLICY IF EXISTS "Staff can read support tickets" ON public.support_requests;
CREATE POLICY "Staff can read support tickets" ON public.support_requests
  FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'tickets.view'::public.staff_permission)
         AND public.staff_can_see_country(auth.uid(), country));

DROP POLICY IF EXISTS "Staff can update support tickets" ON public.support_requests;
CREATE POLICY "Staff can update support tickets" ON public.support_requests
  FOR UPDATE TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'tickets.manage'::public.staff_permission)
         AND public.staff_can_see_country(auth.uid(), country))
  WITH CHECK (public.has_staff_permission(auth.uid(), 'tickets.manage'::public.staff_permission)
              AND public.staff_can_see_country(auth.uid(), country));

-- admin_notes
DROP POLICY IF EXISTS "admin notes read by ticket viewer" ON public.admin_notes;
CREATE POLICY "admin notes read by ticket viewer" ON public.admin_notes
  FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'tickets.view'::public.staff_permission)
         AND public.staff_can_see_country(auth.uid(), country));

DROP POLICY IF EXISTS "admin notes insert by ticket replier" ON public.admin_notes;
CREATE POLICY "admin notes insert by ticket replier" ON public.admin_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND public.has_staff_permission(auth.uid(), 'tickets.reply'::public.staff_permission)
    AND public.staff_can_see_country(
      auth.uid(),
      COALESCE((SELECT sr.country FROM public.support_requests sr WHERE sr.id = support_request_id), 'United Kingdom')
    )
  );

-- user_activity_log
DROP POLICY IF EXISTS "Staff can read activity" ON public.user_activity_log;
CREATE POLICY "Staff can read activity" ON public.user_activity_log
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.has_staff_permission(auth.uid(), 'users.view'::public.staff_permission)
      AND public.staff_can_see_country(auth.uid(), country)
    )
  );

-- user_risk_scores
DROP POLICY IF EXISTS "Staff can read risk scores" ON public.user_risk_scores;
CREATE POLICY "Staff can read risk scores" ON public.user_risk_scores
  FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'users.view'::public.staff_permission)
         AND public.staff_can_see_country(auth.uid(), country));

-- professional_credits (admin path is country-scoped)
DROP POLICY IF EXISTS "credits self read" ON public.professional_credits;
CREATE POLICY "credits self read" ON public.professional_credits
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.professionals p
              WHERE p.id = professional_credits.professional_id AND p.user_id = auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND public.staff_can_see_country(auth.uid(), country)
    )
  );

-- credit_subscriptions
DROP POLICY IF EXISTS "subs staff read" ON public.credit_subscriptions;
CREATE POLICY "subs staff read" ON public.credit_subscriptions
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND public.staff_can_see_country(auth.uid(), country));

-- credit_transactions (admin path is country-scoped)
DROP POLICY IF EXISTS "credit tx self read" ON public.credit_transactions;
CREATE POLICY "credit tx self read" ON public.credit_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.professionals p
              WHERE p.id = credit_transactions.professional_id AND p.user_id = auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND public.staff_can_see_country(auth.uid(), country)
    )
  );
