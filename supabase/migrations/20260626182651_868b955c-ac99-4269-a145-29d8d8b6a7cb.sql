
CREATE OR REPLACE FUNCTION public._refund_lead_report(_report_id uuid, _actor uuid, _note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    VALUES (_pro_user, 'Dispute Approved',
      'Your dispute has been approved. Please check your email for more information.',
      '/pro/refunds');
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_lead_report(_report_id uuid, _decision text, _note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r RECORD;
  _job RECORD;
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
      VALUES (_pro_user, 'Dispute Rejected',
        'Your dispute has been reviewed. Please check your email for the outcome.',
        '/pro/refunds');
    END IF;
    RETURN;
  END IF;

  PERFORM public._refund_lead_report(_report_id, _uid, _note);

  UPDATE public.jobs SET quality_status = 'invalid' WHERE id = _r.job_id;

  PERFORM public._refund_lead_report(other.id, _uid, 'Auto-approved with primary report')
    FROM public.lead_reports other
    WHERE other.job_id = _r.job_id
      AND other.status = 'pending'
      AND other.id <> _report_id;
END $function$;
