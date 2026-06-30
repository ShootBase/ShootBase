
-- 1. Add quality_status to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS quality_status text;
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_quality_status_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_quality_status_check
  CHECK (quality_status IS NULL OR quality_status IN ('under_review','invalid'));

-- 2. lead_reports
CREATE TABLE IF NOT EXISTS public.lead_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unlock_id uuid REFERENCES public.lead_unlocks(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('disconnected','wrong_number')),
  attempted_call boolean NOT NULL DEFAULT false,
  attempted_sms boolean NOT NULL DEFAULT false,
  notes text CHECK (notes IS NULL OR length(notes) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  credit_refunded boolean NOT NULL DEFAULT false,
  credits_refunded_amount integer,
  refund_transaction_id uuid REFERENCES public.credit_transactions(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, professional_id),
  CHECK (attempted_call OR attempted_sms)
);
GRANT SELECT, INSERT, UPDATE ON public.lead_reports TO authenticated;
GRANT ALL ON public.lead_reports TO service_role;
CREATE INDEX IF NOT EXISTS lead_reports_job_idx ON public.lead_reports (job_id);
CREATE INDEX IF NOT EXISTS lead_reports_pro_idx ON public.lead_reports (professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_reports_status_idx ON public.lead_reports (status, created_at DESC);

ALTER TABLE public.lead_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_reports owner read" ON public.lead_reports
  FOR SELECT TO authenticated
  USING (reporter_user_id = auth.uid()
    OR public.has_staff_permission(auth.uid(), 'users.edit'::public.staff_permission)
    OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- No client-side insert/update; everything goes via SECURITY DEFINER RPCs.

CREATE TRIGGER tg_lead_reports_updated
  BEFORE UPDATE ON public.lead_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. lead_report_events (audit trail)
CREATE TABLE IF NOT EXISTS public.lead_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.lead_reports(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_report_events TO authenticated;
GRANT ALL ON public.lead_report_events TO service_role;
CREATE INDEX IF NOT EXISTS lead_report_events_report_idx ON public.lead_report_events (report_id, created_at DESC);
ALTER TABLE public.lead_report_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_report_events admin read" ON public.lead_report_events
  FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'users.edit'::public.staff_permission)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.lead_reports r
               WHERE r.id = lead_report_events.report_id
                 AND r.reporter_user_id = auth.uid()));

-- 4. submit_lead_report (Pro submits)
CREATE OR REPLACE FUNCTION public.submit_lead_report(
  _job_id uuid,
  _reason text,
  _attempted_call boolean,
  _attempted_sms boolean,
  _notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _pro_id uuid;
  _unlock RECORD;
  _existing uuid;
  _report_id uuid;
  _pending_count int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _reason NOT IN ('disconnected','wrong_number') THEN RAISE EXCEPTION 'invalid_reason'; END IF;
  IF NOT (_attempted_call OR _attempted_sms) THEN RAISE EXCEPTION 'attempt_required'; END IF;
  IF _notes IS NOT NULL AND length(_notes) > 500 THEN RAISE EXCEPTION 'notes_too_long'; END IF;

  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = _uid;
  IF _pro_id IS NULL THEN RAISE EXCEPTION 'not_a_professional'; END IF;

  SELECT * INTO _unlock FROM public.lead_unlocks
    WHERE job_id = _job_id AND professional_id = _pro_id;
  IF _unlock IS NULL THEN RAISE EXCEPTION 'not_unlocked'; END IF;

  IF _unlock.unlocked_at < now() - interval '24 hours' THEN
    RAISE EXCEPTION 'report_window_expired';
  END IF;

  SELECT id INTO _existing FROM public.lead_reports
    WHERE job_id = _job_id AND professional_id = _pro_id;
  IF _existing IS NOT NULL THEN RAISE EXCEPTION 'already_reported'; END IF;

  INSERT INTO public.lead_reports
    (job_id, professional_id, reporter_user_id, unlock_id, reason,
     attempted_call, attempted_sms, notes)
  VALUES
    (_job_id, _pro_id, _uid, _unlock.id, _reason,
     COALESCE(_attempted_call,false), COALESCE(_attempted_sms,false), NULLIF(trim(_notes),''))
  RETURNING id INTO _report_id;

  INSERT INTO public.lead_report_events (report_id, action, actor_user_id, metadata)
    VALUES (_report_id, 'submitted', _uid,
      jsonb_build_object('reason', _reason,
        'attempted_call', _attempted_call, 'attempted_sms', _attempted_sms));

  -- Mark for review when 2+ pending reports
  SELECT count(*) INTO _pending_count FROM public.lead_reports
    WHERE job_id = _job_id AND status = 'pending';
  IF _pending_count >= 2 THEN
    UPDATE public.jobs SET quality_status = 'under_review' WHERE id = _job_id
      AND (quality_status IS NULL OR quality_status = 'under_review');
    INSERT INTO public.lead_report_events (report_id, action, metadata)
      VALUES (_report_id, 'auto_under_review',
        jsonb_build_object('pending_count', _pending_count));
  END IF;

  -- Notify reporter (in-app)
  INSERT INTO public.notifications (user_id, title, body, url)
  VALUES (_uid, 'Report submitted',
    'We''ll verify the contact info. If invalid, your credits will be refunded.',
    '/pro/leads');

  RETURN _report_id;
END $fn$;

-- 5. admin_resolve_lead_report (approve = refund; reject = close)
CREATE OR REPLACE FUNCTION public.admin_resolve_lead_report(
  _report_id uuid,
  _decision text,
  _note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _r RECORD;
  _job RECORD;
  _refund_tx uuid;
  _pro_user uuid;
BEGIN
  IF NOT public.has_staff_permission(_uid, 'users.edit'::public.staff_permission)
     AND NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_decision'; END IF;

  SELECT * INTO _r FROM public.lead_reports WHERE id = _report_id FOR UPDATE;
  IF _r IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _r.status <> 'pending' THEN RAISE EXCEPTION 'already_resolved'; END IF;

  SELECT * INTO _job FROM public.jobs WHERE id = _r.job_id;

  IF _decision = 'reject' THEN
    UPDATE public.lead_reports
      SET status = 'rejected', resolved_at = now(), resolved_by = _uid,
          resolution_note = NULLIF(trim(_note),'')
      WHERE id = _report_id;
    INSERT INTO public.lead_report_events (report_id, action, actor_user_id, metadata)
      VALUES (_report_id, 'rejected', _uid, jsonb_build_object('note', _note));
    SELECT user_id INTO _pro_user FROM public.professionals WHERE id = _r.professional_id;
    IF _pro_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, url)
      VALUES (_pro_user, 'Report reviewed',
        'After review, we couldn''t verify the contact info as invalid. No refund was issued.',
        '/pro/leads');
    END IF;
    RETURN;
  END IF;

  -- approve: refund this reporter
  PERFORM public._refund_lead_report(_report_id, _uid, _note);

  -- Mark job as invalid; auto-approve all other pending reports on the same lead
  UPDATE public.jobs SET quality_status = 'invalid' WHERE id = _r.job_id;

  PERFORM public._refund_lead_report(other.id, _uid, 'Auto-approved with primary report')
    FROM public.lead_reports other
    WHERE other.job_id = _r.job_id
      AND other.status = 'pending'
      AND other.id <> _report_id;
END $fn$;

-- Helper: refund a single report
CREATE OR REPLACE FUNCTION public._refund_lead_report(
  _report_id uuid, _actor uuid, _note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _r RECORD; _credits int; _tx uuid; _pro_user uuid; _job_title text;
BEGIN
  SELECT * INTO _r FROM public.lead_reports WHERE id = _report_id FOR UPDATE;
  IF _r IS NULL OR _r.status <> 'pending' THEN RETURN; END IF;

  SELECT credits_used INTO _credits FROM public.lead_unlocks
    WHERE job_id = _r.job_id AND professional_id = _r.professional_id;
  _credits := COALESCE(_credits, 0);

  IF _credits > 0 THEN
    UPDATE public.professional_credits
      SET credit_balance = credit_balance + _credits
      WHERE professional_id = _r.professional_id;
    INSERT INTO public.credit_transactions
      (professional_id, amount, transaction_type, description)
    VALUES (_r.professional_id, _credits, 'refund',
      'Refund: invalid contact info for lead ' || _r.job_id::text)
    RETURNING id INTO _tx;
  END IF;

  UPDATE public.lead_reports
    SET status = 'approved', resolved_at = now(), resolved_by = _actor,
        resolution_note = NULLIF(trim(_note),''),
        credit_refunded = (_credits > 0),
        credits_refunded_amount = _credits,
        refund_transaction_id = _tx
    WHERE id = _report_id;

  INSERT INTO public.lead_report_events (report_id, action, actor_user_id, metadata)
    VALUES (_report_id, 'approved_refunded', _actor,
      jsonb_build_object('credits', _credits, 'tx', _tx, 'note', _note));

  SELECT user_id INTO _pro_user FROM public.professionals WHERE id = _r.professional_id;
  SELECT title INTO _job_title FROM public.jobs WHERE id = _r.job_id;
  IF _pro_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, url)
    VALUES (_pro_user, 'Credits refunded',
      'Your report was approved. ' || _credits ||
        ' credits have been returned for ' || COALESCE(_job_title,'the lead') || '.',
      '/pro/credits');
  END IF;
END $fn$;

-- 6. Helper RPCs for app
CREATE OR REPLACE FUNCTION public.my_lead_reports()
RETURNS TABLE (
  id uuid, job_id uuid, job_title text, status text, reason text,
  credit_refunded boolean, credits_refunded_amount int,
  created_at timestamptz, resolved_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.job_id, j.title, r.status, r.reason,
         r.credit_refunded, r.credits_refunded_amount, r.created_at, r.resolved_at
  FROM public.lead_reports r
  JOIN public.jobs j ON j.id = r.job_id
  WHERE r.reporter_user_id = auth.uid()
  ORDER BY r.created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_lead_reports(_status text DEFAULT NULL)
RETURNS TABLE (
  job_id uuid, job_title text, customer_name text,
  report_count int, pending_count int, quality_status text,
  last_report_at timestamptz, first_report_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.has_staff_permission(auth.uid(), 'users.edit'::public.staff_permission)
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT j.id, j.title, COALESCE(p.full_name,'Client'),
         count(r.id)::int,
         count(r.id) FILTER (WHERE r.status = 'pending')::int,
         j.quality_status,
         max(r.created_at), min(r.created_at)
  FROM public.lead_reports r
  JOIN public.jobs j ON j.id = r.job_id
  LEFT JOIN public.profiles p ON p.id = j.customer_id
  WHERE (_status IS NULL OR
         (_status = 'pending' AND EXISTS (SELECT 1 FROM public.lead_reports r2
                                          WHERE r2.job_id = j.id AND r2.status='pending')) OR
         (_status = 'resolved' AND NOT EXISTS (SELECT 1 FROM public.lead_reports r2
                                               WHERE r2.job_id = j.id AND r2.status='pending')))
  GROUP BY j.id, j.title, p.full_name, j.quality_status
  ORDER BY max(r.created_at) DESC
  LIMIT 200;
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_get_lead_reports(_job_id uuid)
RETURNS TABLE (
  id uuid, professional_id uuid, business_name text,
  reason text, notes text, attempted_call boolean, attempted_sms boolean,
  status text, credits_refunded_amount int,
  created_at timestamptz, resolved_at timestamptz, resolution_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.has_staff_permission(auth.uid(), 'users.edit'::public.staff_permission)
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT r.id, r.professional_id, pr.business_name,
         r.reason, r.notes, r.attempted_call, r.attempted_sms,
         r.status, r.credits_refunded_amount,
         r.created_at, r.resolved_at, r.resolution_note
  FROM public.lead_reports r
  LEFT JOIN public.professionals pr ON pr.id = r.professional_id
  WHERE r.job_id = _job_id
  ORDER BY r.created_at DESC;
END $fn$;
