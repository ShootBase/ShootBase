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

NOTIFY pgrst, 'reload schema';