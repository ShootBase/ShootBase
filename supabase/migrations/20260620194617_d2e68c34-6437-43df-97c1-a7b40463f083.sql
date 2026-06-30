
DROP VIEW IF EXISTS public.message_email_debug;
CREATE VIEW public.message_email_debug
WITH (security_invoker = true) AS
SELECT
  men.id AS notification_id,
  men.message_id,
  men.quote_request_id,
  men.recipient_user_id,
  men.recipient_role,
  men.status,
  men.sent_at,
  men.created_at,
  m.body AS message_body,
  m.sender_id,
  j.title AS job_title,
  esl.status AS delivery_status,
  esl.error_message AS delivery_error
FROM public.message_email_notifications men
JOIN public.messages m ON m.id = men.message_id
LEFT JOIN public.quote_requests qr ON qr.id = men.quote_request_id
LEFT JOIN public.jobs j ON j.id = qr.job_id
LEFT JOIN LATERAL (
  SELECT status, error_message FROM public.email_send_log
   WHERE message_id = men.email_message_id
   ORDER BY created_at DESC LIMIT 1
) esl ON TRUE;
GRANT SELECT ON public.message_email_debug TO authenticated;
GRANT ALL ON public.message_email_debug TO service_role;
