
CREATE TABLE public.client_notification_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_new_message BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_notification_prefs TO authenticated;
GRANT ALL ON public.client_notification_prefs TO service_role;
ALTER TABLE public.client_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage their own client notif prefs"
  ON public.client_notification_prefs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_client_notif_prefs_updated_at
  BEFORE UPDATE ON public.client_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.message_email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  quote_request_id UUID NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('client','professional')),
  status TEXT NOT NULL CHECK (status IN ('sent','skipped_throttled','skipped_pref','skipped_suppressed','skipped_own','failed')),
  email_message_id TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.message_email_notifications TO authenticated;
GRANT ALL ON public.message_email_notifications TO service_role;
ALTER TABLE public.message_email_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipient can view own message email notifs"
  ON public.message_email_notifications FOR SELECT
  USING (auth.uid() = recipient_user_id OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_msg_email_throttle
  ON public.message_email_notifications (quote_request_id, recipient_user_id, sent_at DESC)
  WHERE status = 'sent';

CREATE OR REPLACE VIEW public.message_email_debug AS
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
  u.email::text AS recipient_email,
  esl.status AS delivery_status,
  esl.error_message AS delivery_error
FROM public.message_email_notifications men
JOIN public.messages m ON m.id = men.message_id
LEFT JOIN public.quote_requests qr ON qr.id = men.quote_request_id
LEFT JOIN public.jobs j ON j.id = qr.job_id
LEFT JOIN auth.users u ON u.id = men.recipient_user_id
LEFT JOIN LATERAL (
  SELECT status, error_message FROM public.email_send_log
   WHERE message_id = men.email_message_id
   ORDER BY created_at DESC LIMIT 1
) esl ON TRUE;
GRANT SELECT ON public.message_email_debug TO authenticated;
GRANT ALL ON public.message_email_debug TO service_role;

CREATE OR REPLACE FUNCTION public.tg_bump_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _qr RECORD;
  _recipient_user_id UUID;
  _is_from_customer BOOLEAN;
  _recipient_email TEXT;
  _recipient_role TEXT;
  _thread_url TEXT;
  _suppressed BOOLEAN;
  _job_title TEXT;
  _sender_name TEXT;
  _email_pref BOOLEAN;
  _last_sent_at TIMESTAMPTZ;
  _throttle_interval INTERVAL := '45 minutes';
  _skip_status TEXT;
BEGIN
  UPDATE public.quote_requests
    SET last_message_at = now(), updated_at = now()
    WHERE id = NEW.quote_request_id
    RETURNING * INTO _qr;

  _is_from_customer := (_qr.customer_id = NEW.sender_id);

  IF _is_from_customer THEN
    SELECT user_id INTO _recipient_user_id FROM public.professionals WHERE id = _qr.professional_id;
    _recipient_role := 'professional';
    _thread_url := 'https://www.shootbase.co.uk/pro/responses?c=' || NEW.quote_request_id::text;
  ELSE
    _recipient_user_id := _qr.customer_id;
    _recipient_role := 'client';
    _thread_url := 'https://www.shootbase.co.uk/threads/' || NEW.quote_request_id::text;
  END IF;

  IF NEW.source <> 'system' AND _recipient_user_id IS NOT NULL AND NEW.sender_id <> _recipient_user_id THEN
    INSERT INTO public.notifications (user_id, title, body, url)
    VALUES (
      _recipient_user_id,
      'New message',
      LEFT(NEW.body, 140),
      CASE WHEN _is_from_customer
           THEN '/pro/responses?c=' || NEW.quote_request_id::text
           ELSE '/threads/' || NEW.quote_request_id::text END
    );

    SELECT j.title INTO _job_title FROM public.jobs j WHERE j.id = _qr.job_id;
    IF _is_from_customer THEN
      SELECT COALESCE(NULLIF(p.full_name, ''), 'Your client') INTO _sender_name
        FROM public.profiles p WHERE p.id = NEW.sender_id;
    ELSE
      SELECT COALESCE(NULLIF(pr.business_name, ''), NULLIF(pr.contact_name, ''), 'A professional')
        INTO _sender_name
        FROM public.professionals pr WHERE pr.user_id = NEW.sender_id;
    END IF;

    SELECT email::TEXT INTO _recipient_email FROM auth.users WHERE id = _recipient_user_id;

    _skip_status := NULL;

    IF _recipient_role = 'client' THEN
      SELECT email_new_message INTO _email_pref
        FROM public.client_notification_prefs WHERE user_id = _recipient_user_id;
      IF _email_pref IS NOT NULL AND _email_pref = FALSE THEN
        _skip_status := 'skipped_pref';
      END IF;
    END IF;

    IF _skip_status IS NULL AND _recipient_email IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.suppressed_emails WHERE email = lower(_recipient_email)
      ) INTO _suppressed;
      IF _suppressed THEN _skip_status := 'skipped_suppressed'; END IF;
    END IF;

    IF _skip_status IS NULL THEN
      SELECT MAX(sent_at) INTO _last_sent_at
        FROM public.message_email_notifications
        WHERE quote_request_id = NEW.quote_request_id
          AND recipient_user_id = _recipient_user_id
          AND status = 'sent';
      IF _last_sent_at IS NOT NULL AND (now() - _last_sent_at) < _throttle_interval THEN
        _skip_status := 'skipped_throttled';
      END IF;
    END IF;

    IF _skip_status IS NOT NULL THEN
      INSERT INTO public.message_email_notifications
        (message_id, quote_request_id, recipient_user_id, recipient_role, status)
        VALUES (NEW.id, NEW.quote_request_id, _recipient_user_id, _recipient_role, _skip_status)
        ON CONFLICT (message_id) DO NOTHING;
    ELSIF _recipient_email IS NOT NULL THEN
      BEGIN
        PERFORM public.enqueue_email(
          'transactional_emails',
          jsonb_build_object(
            'template_name', 'new-message',
            'recipient_email', _recipient_email,
            'idempotency_key', 'msg-' || NEW.id::text,
            'template_data', jsonb_build_object(
              'recipientRole', _recipient_role,
              'threadUrl', _thread_url,
              'senderName', COALESCE(_sender_name, CASE WHEN _is_from_customer THEN 'Your client' ELSE 'A professional' END),
              'jobTitle', COALESCE(_job_title, 'your request'),
              'messagePreview', LEFT(NEW.body, 150),
              'sentAt', to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'preview', LEFT(NEW.body, 90)
            )
          )
        );
        INSERT INTO public.message_email_notifications
          (message_id, quote_request_id, recipient_user_id, recipient_role, status, sent_at)
          VALUES (NEW.id, NEW.quote_request_id, _recipient_user_id, _recipient_role, 'sent', now())
          ON CONFLICT (message_id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'enqueue_email failed for message %: %', NEW.id, SQLERRM;
        INSERT INTO public.message_email_notifications
          (message_id, quote_request_id, recipient_user_id, recipient_role, status)
          VALUES (NEW.id, NEW.quote_request_id, _recipient_user_id, _recipient_role, 'failed')
          ON CONFLICT (message_id) DO NOTHING;
      END;
    END IF;
  END IF;

  RETURN NEW;
END
$function$;
