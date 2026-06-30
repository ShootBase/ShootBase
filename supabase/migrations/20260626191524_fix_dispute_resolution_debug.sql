-- Stabilise the lead-dispute resolution path.
--
-- Root cause fixed here:
--   The database trigger tg_lead_reports_email_status was also enqueueing
--   outcome emails with the old noreply/root-domain sender. Because it wrote a
--   pending email_send_log row before the application-side server dispatcher ran,
--   the dispatcher treated the outcome email as already queued and returned.
--   Those trigger-created rows then stayed pending or failed in the queue, so
--   admins saw no reliable email outcome and pros did not get the expected mail.
--
-- One clear source of truth remains for dispute state: public.lead_reports.status.
-- One email path remains: server-side sendLeadDisputeOutcomeEmail after the RPC
-- commits the status/notification/audit changes.

-- Realtime: pro refund pages subscribe to these tables, so they must be in the
-- Supabase Realtime publication. Use FULL identity so UPDATE payloads are useful
-- even as the schema evolves.
ALTER TABLE public.lead_reports REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'lead_reports'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_reports;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;

-- Remove the duplicate database-side email queue path. Email enqueue stays
-- server-side in src/lib/lead-dispute-email.server.ts after status update.
DROP TRIGGER IF EXISTS tg_lead_reports_email_insert ON public.lead_reports;
DROP TRIGGER IF EXISTS tg_lead_reports_email_status ON public.lead_reports;
DROP FUNCTION IF EXISTS public.enqueue_lead_dispute_email_event();

-- Keep the RPC as the single atomic database transition for status, audit and
-- in-app notification. Approval still refunds credits and still cascades to
-- sibling pending reports for the same invalid lead.
CREATE OR REPLACE FUNCTION public._insert_dispute_outcome_notification(
  _user_id uuid,
  _title text,
  _body text,
  _url text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _notification_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Prevent duplicate outcome notifications if an admin retries the same action
  -- path or a deployment race replays the function. No new notification columns
  -- are introduced; this uses the existing user/title/body/url fields.
  SELECT id INTO _notification_id
  FROM public.notifications
  WHERE user_id = _user_id
    AND title = _title
    AND body = _body
    AND COALESCE(url, '') = COALESCE(_url, '')
    AND created_at >= now() - interval '10 minutes'
  ORDER BY created_at DESC
  LIMIT 1;

  IF _notification_id IS NULL THEN
    INSERT INTO public.notifications (user_id, title, body, url)
    VALUES (_user_id, _title, _body, _url)
    RETURNING id INTO _notification_id;
  END IF;

  RETURN _notification_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public._refund_lead_report(_report_id uuid, _actor uuid, _note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r RECORD;
  _credits int;
  _tx uuid;
  _pro_user uuid;
  _job_title text;
  _notification_id uuid;
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
        resolution_note = NULLIF(trim(COALESCE(_note, '')), ''),
        credit_refunded = (_credits > 0),
        credits_refunded_amount = _credits,
        refund_transaction_id = _tx
    WHERE id = _report_id;

  SELECT user_id INTO _pro_user FROM public.professionals WHERE id = _r.professional_id;
  SELECT title INTO _job_title FROM public.jobs WHERE id = _r.job_id;

  SELECT public._insert_dispute_outcome_notification(
    _pro_user,
    'Lead refund approved',
    'Your dispute for lead #' || upper(left(_r.job_id::text, 8)) || ' was approved. ' || _credits || ' credit' || CASE WHEN _credits = 1 THEN '' ELSE 's' END || ' refunded.',
    '/pro/refunds'
  ) INTO _notification_id;

  INSERT INTO public.lead_report_events (report_id, action, actor_user_id, metadata)
    VALUES (_report_id, 'approved_refunded', _actor,
      jsonb_build_object(
        'credits', _credits,
        'tx', _tx,
        'note', _note,
        'notification_id', _notification_id,
        'notification_user_id', _pro_user,
        'job_title', _job_title
      ));
END;
$function$;

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
  _notification_id uuid;
BEGIN
  IF NOT public.has_staff_permission(_uid, 'users.edit'::public.staff_permission)
     AND NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  IF _decision = 'reject' AND length(trim(COALESCE(_note, ''))) = 0 THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;

  SELECT * INTO _r FROM public.lead_reports WHERE id = _report_id FOR UPDATE;
  IF _r IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _r.status <> 'pending' THEN RAISE EXCEPTION 'already_resolved'; END IF;

  SELECT * INTO _job FROM public.jobs WHERE id = _r.job_id;

  IF _decision = 'reject' THEN
    UPDATE public.lead_reports
      SET status = 'rejected', resolved_at = now(), resolved_by = _uid,
          resolution_note = NULLIF(trim(COALESCE(_note, '')), '')
      WHERE id = _report_id;

    SELECT user_id INTO _pro_user FROM public.professionals WHERE id = _r.professional_id;
    SELECT public._insert_dispute_outcome_notification(
      _pro_user,
      'Lead dispute update',
      'Your dispute for lead #' || upper(left(_r.job_id::text, 8)) || ' was reviewed and rejected. See email for details.',
      '/pro/refunds'
    ) INTO _notification_id;

    INSERT INTO public.lead_report_events (report_id, action, actor_user_id, metadata)
      VALUES (_report_id, 'rejected', _uid, jsonb_build_object(
        'note', _note,
        'notification_id', _notification_id,
        'notification_user_id', _pro_user
      ));
    RETURN;
  END IF;

  PERFORM public._refund_lead_report(_report_id, _uid, _note);

  UPDATE public.jobs SET quality_status = 'invalid' WHERE id = _r.job_id;

  PERFORM public._refund_lead_report(other.id, _uid, 'Auto-approved with primary report')
    FROM public.lead_reports other
    WHERE other.job_id = _r.job_id
      AND other.status = 'pending'
      AND other.id <> _report_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._insert_dispute_outcome_notification(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._insert_dispute_outcome_notification(uuid, text, text, text) TO service_role;

-- Admin drawer debug RPC. This is read-only and deliberately reports the exact
-- status source, resolved professional user/email, notification row and email
-- queue/log state for a single dispute.
CREATE OR REPLACE FUNCTION public.admin_get_lead_dispute_debug(_report_id uuid)
RETURNS TABLE (
  report_id uuid,
  current_dispute_status text,
  current_outcome text,
  professional_id uuid,
  professional_user_id uuid,
  professional_email text,
  email_queue_status text,
  email_queue_message_id text,
  email_queue_pgmq_msg_id bigint,
  email_queue_read_count int,
  last_email_error text,
  notification_created boolean,
  notification_user_id uuid,
  notification_id uuid,
  last_updated_timestamp timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.lead_reports%ROWTYPE;
  _pro_user uuid;
  _email text;
  _latest_log public.email_send_log%ROWTYPE;
  _queue record;
  _dlq record;
  _notif public.notifications%ROWTYPE;
  _message_prefixes text[];
BEGIN
  IF NOT public.has_staff_permission(_uid, 'users.edit'::public.staff_permission)
     AND NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO _r FROM public.lead_reports WHERE id = _report_id;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  SELECT p.user_id INTO _pro_user FROM public.professionals p WHERE p.id = _r.professional_id;
  SELECT u.email::text INTO _email FROM auth.users u WHERE u.id = _pro_user;

  _message_prefixes := ARRAY[
    'lead-dispute-approve-' || _r.id::text,
    'lead-dispute-reject-' || _r.id::text
  ];

  SELECT l.* INTO _latest_log
  FROM public.email_send_log l
  WHERE l.message_id = ANY(_message_prefixes)
     OR l.message_id LIKE (_message_prefixes[1] || '-retry-%')
     OR l.message_id LIKE (_message_prefixes[2] || '-retry-%')
  ORDER BY l.created_at DESC
  LIMIT 1;

  BEGIN
    SELECT q.msg_id, q.read_ct, q.message INTO _queue
    FROM pgmq.q_transactional_emails q
    WHERE q.message->>'message_id' = ANY(_message_prefixes)
       OR q.message->>'idempotency_key' = ANY(_message_prefixes)
       OR q.message->>'message_id' LIKE (_message_prefixes[1] || '-retry-%')
       OR q.message->>'message_id' LIKE (_message_prefixes[2] || '-retry-%')
       OR q.message->>'idempotency_key' LIKE (_message_prefixes[1] || '-retry-%')
       OR q.message->>'idempotency_key' LIKE (_message_prefixes[2] || '-retry-%')
    ORDER BY q.enqueued_at DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    SELECT d.msg_id, d.read_ct, d.message INTO _dlq
    FROM pgmq.q_transactional_emails_dlq d
    WHERE d.message->>'message_id' = ANY(_message_prefixes)
       OR d.message->>'idempotency_key' = ANY(_message_prefixes)
       OR d.message->>'message_id' LIKE (_message_prefixes[1] || '-retry-%')
       OR d.message->>'message_id' LIKE (_message_prefixes[2] || '-retry-%')
       OR d.message->>'idempotency_key' LIKE (_message_prefixes[1] || '-retry-%')
       OR d.message->>'idempotency_key' LIKE (_message_prefixes[2] || '-retry-%')
    ORDER BY d.enqueued_at DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  SELECT n.* INTO _notif
  FROM public.notifications n
  WHERE n.user_id = _pro_user
    AND n.url = '/pro/refunds'
    AND (
      (_r.status = 'approved' AND n.title IN ('Lead refund approved', 'Dispute Approved', 'Credits refunded'))
      OR (_r.status = 'rejected' AND n.title IN ('Lead dispute update', 'Dispute Rejected', 'Report reviewed'))
      OR (_r.status = 'pending' AND n.title IN ('Lead refund approved', 'Dispute Approved', 'Credits refunded', 'Lead dispute update', 'Dispute Rejected', 'Report reviewed'))
    )
    AND n.created_at >= COALESCE(_r.resolved_at, _r.created_at) - interval '2 minutes'
  ORDER BY n.created_at DESC
  LIMIT 1;

  RETURN QUERY SELECT
    _r.id,
    _r.status,
    _r.status,
    _r.professional_id,
    _pro_user,
    _email,
    CASE
      WHEN _latest_log.status = 'sent' THEN 'sent'
      WHEN _latest_log.status IN ('failed','bounced','complained','suppressed','dlq') OR _dlq.msg_id IS NOT NULL THEN 'failed'
      WHEN _queue.msg_id IS NOT NULL THEN 'queued'
      WHEN _latest_log.status = 'pending' THEN 'pending'
      ELSE 'none'
    END,
    COALESCE(_queue.message->>'message_id', _queue.message->>'idempotency_key', _latest_log.message_id),
    _queue.msg_id,
    _queue.read_ct,
    COALESCE(_latest_log.error_message, _dlq.message->>'error_message'),
    (_notif.id IS NOT NULL),
    _notif.user_id,
    _notif.id,
    COALESCE(_r.updated_at, _latest_log.created_at, _notif.created_at);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_lead_dispute_debug(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_lead_dispute_debug(uuid) TO authenticated;
