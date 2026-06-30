
DROP VIEW IF EXISTS public.lead_notification_debug;
CREATE VIEW public.lead_notification_debug
WITH (security_invoker = false) AS
SELECT lmn.id AS notification_id,
  lmn.job_id,
  lmn.professional_id AS pro_id,
  pr.business_name AS pro_business_name,
  u.email::text AS pro_email,
  j.title AS job_title,
  j.city AS job_city,
  s.name AS service_name,
  COALESCE(pnp.lead_email_mode, 'instant'::lead_email_mode) AS pref_mode,
  COALESCE(pnp.lead_inapp_enabled, true) AS pref_inapp,
  lmn.email_status AS notification_status,
  CASE WHEN lmn.inapp_sent_at IS NOT NULL THEN 'in_app+email' ELSE 'email' END AS notification_type,
  lmn.created_at,
  lmn.email_sent_at AS sent_at,
  lmn.email_message_id,
  esl.status AS delivery_status,
  esl.error_message AS delivery_error,
  lmn.inapp_sent_at
FROM lead_match_notifications lmn
JOIN jobs j ON j.id = lmn.job_id
JOIN professionals pr ON pr.id = lmn.professional_id
LEFT JOIN auth.users u ON u.id = pr.user_id
LEFT JOIN services s ON s.id = j.service_id
LEFT JOIN pro_notification_prefs pnp ON pnp.professional_id = lmn.professional_id
LEFT JOIN LATERAL (
  SELECT status, error_message FROM email_send_log
  WHERE message_id = lmn.email_message_id
  ORDER BY created_at DESC LIMIT 1
) esl ON true;

GRANT SELECT ON public.lead_notification_debug TO service_role;

-- Same fix for message_email_debug if it exists and references auth.users
DO $$
DECLARE _def text;
BEGIN
  SELECT definition INTO _def FROM pg_views WHERE viewname='message_email_debug' AND schemaname='public';
  IF _def IS NOT NULL THEN
    EXECUTE 'DROP VIEW public.message_email_debug';
    EXECUTE 'CREATE VIEW public.message_email_debug WITH (security_invoker = false) AS ' || _def;
    EXECUTE 'GRANT SELECT ON public.message_email_debug TO service_role';
  END IF;
END $$;
