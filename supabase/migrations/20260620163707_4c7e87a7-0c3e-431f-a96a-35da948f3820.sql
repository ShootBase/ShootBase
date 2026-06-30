CREATE OR REPLACE FUNCTION public.tg_bump_thread()
 RETURNS trigger
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

    SELECT email::TEXT INTO _recipient_email FROM auth.users WHERE id = _recipient_user_id;

    IF _recipient_email IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.suppressed_emails WHERE email = lower(_recipient_email)
      ) INTO _suppressed;

      IF NOT _suppressed THEN
        BEGIN
          PERFORM public.enqueue_email(
            jsonb_build_object(
              'template_name', 'new-message',
              'recipient_email', _recipient_email,
              'idempotency_key', 'msg-' || NEW.id::text,
              'template_data', jsonb_build_object(
                'recipientRole', _recipient_role,
                'threadUrl', _thread_url,
                'preview', LEFT(NEW.body, 90)
              )
            )
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'enqueue_email failed for message %: %', NEW.id, SQLERRM;
        END;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END
$function$;