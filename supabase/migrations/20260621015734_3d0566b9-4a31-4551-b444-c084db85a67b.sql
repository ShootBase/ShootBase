CREATE OR REPLACE FUNCTION public.request_pro_contact(_job_id uuid, _professional_id uuid)
 RETURNS TABLE(id uuid, status text, created_at timestamp with time zone, was_new boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_variable
DECLARE
  _job RECORD;
  _pro RECORD;
  _existing RECORD;
  _row RECORD;
  _pro_email TEXT;
  _client_name TEXT;
  _suppressed BOOLEAN;
  _was_new BOOLEAN := FALSE;
  _service_name TEXT;
  _job_category TEXT;
  _location TEXT;
  _body TEXT;
  _message_id TEXT;
  _unsub_token TEXT;
  _html TEXT;
  _text TEXT;
  _msg_id BIGINT;
BEGIN
  RAISE LOG 'Request Contact clicked job=% pro=% caller=%', _job_id, _professional_id, auth.uid();

  SELECT * INTO _job FROM public.jobs j WHERE j.id = _job_id;
  IF _job IS NULL THEN RAISE EXCEPTION 'job_not_found'; END IF;
  IF _job.customer_id <> auth.uid() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT p.id, p.user_id, p.business_name, p.contact_name, p.status
    INTO _pro
    FROM public.professionals p WHERE p.id = _professional_id;
  IF _pro IS NULL OR _pro.status <> 'active' THEN RAISE EXCEPTION 'pro_unavailable'; END IF;

  SELECT * INTO _existing FROM public.pro_contact_requests cr
    WHERE cr.job_id = _job_id AND cr.professional_id = _professional_id;
  IF _existing.id IS NOT NULL THEN
    RAISE LOG 'Contact request already exists id=%', _existing.id;
    RETURN QUERY SELECT _existing.id, _existing.status::TEXT, _existing.created_at, FALSE;
    RETURN;
  END IF;

  INSERT INTO public.pro_contact_requests (job_id, professional_id, customer_id, status)
    VALUES (_job_id, _professional_id, auth.uid(), 'pending')
    RETURNING * INTO _row;
  _was_new := TRUE;
  RAISE LOG 'Contact request created id=%', _row.id;

  SELECT s.name INTO _service_name FROM public.services s WHERE s.id = _job.service_id;
  _job_category := COALESCE(_service_name, _job.title, 'a new project');
  _location := COALESCE(NULLIF(_job.city,''), 'Location not specified');

  _body := 'Great news! A client has specifically selected your profile for their project.' ||
           E'\n\nJob Type: ' || _job_category ||
           E'\nLocation: ' || _location ||
           E'\n\nReview the project details and decide whether you''d like to unlock the lead and start the conversation. Client details remain protected until the lead is unlocked.';

  INSERT INTO public.notifications (user_id, title, body, url)
    VALUES (
      _pro.user_id,
      'You''ve Been Requested',
      _body,
      '/pro/leads?job=' || _job_id::text
    );
  RAISE LOG 'Notification created user=% request=%', _pro.user_id, _row.id;

  SELECT email::TEXT INTO _pro_email FROM auth.users WHERE auth.users.id = _pro.user_id;
  _client_name := CASE
    WHEN COALESCE(_job.show_name_to_pros, true) THEN
      COALESCE(NULLIF(_job.client_display_name,''), NULLIF(_job.contact_name,''), 'A client')
    ELSE 'A client' END;

  IF _pro_email IS NULL THEN
    RAISE LOG 'Email failed request=% reason=no_email', _row.id;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.suppressed_emails se WHERE se.email = lower(_pro_email)) INTO _suppressed;
    IF _suppressed THEN
      RAISE LOG 'Email failed request=% reason=suppressed', _row.id;
    ELSE
      SELECT token INTO _unsub_token
      FROM public.email_unsubscribe_tokens
      WHERE email = lower(_pro_email) AND used_at IS NULL
      LIMIT 1;

      IF _unsub_token IS NULL THEN
        _unsub_token := encode(gen_random_bytes(32), 'hex');
        INSERT INTO public.email_unsubscribe_tokens (token, email)
          VALUES (_unsub_token, lower(_pro_email))
          ON CONFLICT (email) DO NOTHING;
        SELECT token INTO _unsub_token
        FROM public.email_unsubscribe_tokens
        WHERE email = lower(_pro_email) AND used_at IS NULL
        LIMIT 1;
      END IF;

      _message_id := gen_random_uuid()::text;
      _html := '<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,sans-serif;color:#1A1A1A"><div style="max-width:560px;padding:24px 28px"><h1 style="font-size:22px;margin:0 0 16px">You''ve Been Requested</h1><p style="font-size:15px;line-height:1.55;color:#3a3a3a">Great news! A client has specifically selected your profile for their project.</p><div style="border-left:3px solid #C5A059;background:#FAF7F1;padding:12px 16px;margin:12px 0"><p style="font-size:14px;margin:4px 0"><strong>Job Type:</strong> ' || replace(replace(replace(_job_category,'&','&amp;'),'<','&lt;'),'>','&gt;') || '</p><p style="font-size:14px;margin:4px 0"><strong>Location:</strong> ' || replace(replace(replace(_location,'&','&amp;'),'<','&lt;'),'>','&gt;') || '</p></div><p style="font-size:15px;line-height:1.55;color:#3a3a3a">Your experience and portfolio matched what the client is looking for.</p><p style="font-size:15px;line-height:1.55;color:#3a3a3a">Review the project details and decide whether you''d like to unlock the lead and start the conversation.</p><p style="font-size:13px;line-height:1.5;color:#6b6b6b;font-style:italic">Client details will remain protected until the lead is unlocked.</p><p style="margin:28px 0"><a href="https://www.shootbase.co.uk/pro/leads?job=' || _job_id::text || '" style="background:#C5A059;color:#ffffff;text-decoration:none;border-radius:4px;padding:12px 22px;font-size:14px;font-weight:bold">Review Project</a></p><p style="font-size:12px;color:#888888;margin:28px 0 0;line-height:1.5">—<br>The Shootbase Team</p></div></body></html>';
      _text := 'You''ve Been Requested' || E'\n\n' || _body || E'\n\nReview Project: https://www.shootbase.co.uk/pro/leads?job=' || _job_id::text;

      INSERT INTO public.email_send_log (message_id, template_name, recipient_email, status, metadata)
      VALUES (_message_id, 'pro-contact-request', _pro_email, 'pending', jsonb_build_object('contact_request_id', _row.id));

      SELECT public.enqueue_email(
        'transactional_emails',
        jsonb_build_object(
          'message_id', _message_id,
          'to', _pro_email,
          'from', 'Shootbase <noreply@shootbase.co.uk>',
          'sender_domain', 'notify.shootbase.co.uk',
          'subject', 'You''ve Been Requested for a New Project',
          'html', _html,
          'text', _text,
          'purpose', 'transactional',
          'label', 'pro-contact-request',
          'idempotency_key', 'contact-req-' || _row.id::text,
          'unsubscribe_token', _unsub_token,
          'queued_at', now()::text
        )
      ) INTO _msg_id;
      RAISE LOG 'Email queued request=% msg_id=%', _row.id, _msg_id;
    END IF;
  END IF;

  RETURN QUERY SELECT _row.id, _row.status::TEXT, _row.created_at, _was_new;
END
$function$;

DO $do$
DECLARE
  _dlq RECORD;
  _message_id TEXT;
  _recipient TEXT;
  _template_data JSONB;
  _job_category TEXT;
  _location TEXT;
  _job_id TEXT;
  _unsub_token TEXT;
  _html TEXT;
  _text TEXT;
BEGIN
  FOR _dlq IN
    SELECT msg_id, message
    FROM pgmq.q_transactional_emails_dlq
    WHERE message->>'template_name' = 'pro-contact-request'
  LOOP
    _recipient := _dlq.message->>'recipient_email';
    _template_data := COALESCE(_dlq.message->'template_data', '{}'::jsonb);
    _job_category := COALESCE(_template_data->>'jobCategory', _template_data->>'jobTitle', 'a new project');
    _location := COALESCE(_template_data->>'city', 'Location not specified');
    _job_id := substring(COALESCE(_template_data->>'requestUrl', '') from 'job=([0-9a-f-]+)');

    IF _recipient IS NULL OR _recipient = '' THEN
      CONTINUE;
    END IF;

    SELECT token INTO _unsub_token FROM public.email_unsubscribe_tokens WHERE email = lower(_recipient) AND used_at IS NULL LIMIT 1;
    IF _unsub_token IS NULL THEN
      _unsub_token := encode(gen_random_bytes(32), 'hex');
      INSERT INTO public.email_unsubscribe_tokens (token, email)
        VALUES (_unsub_token, lower(_recipient))
        ON CONFLICT (email) DO NOTHING;
      SELECT token INTO _unsub_token FROM public.email_unsubscribe_tokens WHERE email = lower(_recipient) AND used_at IS NULL LIMIT 1;
    END IF;

    _message_id := gen_random_uuid()::text;
    _html := '<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,sans-serif;color:#1A1A1A"><div style="max-width:560px;padding:24px 28px"><h1 style="font-size:22px;margin:0 0 16px">You''ve Been Requested</h1><p style="font-size:15px;line-height:1.55;color:#3a3a3a">Great news! A client has specifically selected your profile for their project.</p><div style="border-left:3px solid #C5A059;background:#FAF7F1;padding:12px 16px;margin:12px 0"><p style="font-size:14px;margin:4px 0"><strong>Job Type:</strong> ' || replace(replace(replace(_job_category,'&','&amp;'),'<','&lt;'),'>','&gt;') || '</p><p style="font-size:14px;margin:4px 0"><strong>Location:</strong> ' || replace(replace(replace(_location,'&','&amp;'),'<','&lt;'),'>','&gt;') || '</p></div><p style="font-size:15px;line-height:1.55;color:#3a3a3a">Review the project details and decide whether you''d like to unlock the lead and start the conversation.</p><p style="font-size:13px;line-height:1.5;color:#6b6b6b;font-style:italic">Client details will remain protected until the lead is unlocked.</p><p style="margin:28px 0"><a href="' || COALESCE(_template_data->>'requestUrl','https://www.shootbase.co.uk/pro/leads') || '" style="background:#C5A059;color:#ffffff;text-decoration:none;border-radius:4px;padding:12px 22px;font-size:14px;font-weight:bold">Review Project</a></p><p style="font-size:12px;color:#888888;margin:28px 0 0;line-height:1.5">—<br>The Shootbase Team</p></div></body></html>';
    _text := 'You''ve Been Requested' || E'\n\nJob Type: ' || _job_category || E'\nLocation: ' || _location || E'\n\nReview Project: ' || COALESCE(_template_data->>'requestUrl','https://www.shootbase.co.uk/pro/leads');

    INSERT INTO public.email_send_log (message_id, template_name, recipient_email, status, metadata)
      VALUES (_message_id, 'pro-contact-request', _recipient, 'pending', jsonb_build_object('requeued_from_dlq', _dlq.msg_id))
      ON CONFLICT DO NOTHING;

    PERFORM public.enqueue_email(
      'transactional_emails',
      jsonb_build_object(
        'message_id', _message_id,
        'to', _recipient,
        'from', 'Shootbase <noreply@shootbase.co.uk>',
        'sender_domain', 'notify.shootbase.co.uk',
        'subject', 'You''ve Been Requested for a New Project',
        'html', _html,
        'text', _text,
        'purpose', 'transactional',
        'label', 'pro-contact-request',
        'idempotency_key', COALESCE(_dlq.message->>'idempotency_key', 'contact-req-requeued-' || _dlq.msg_id::text),
        'unsubscribe_token', _unsub_token,
        'queued_at', now()::text
      )
    );
    PERFORM pgmq.delete('transactional_emails_dlq', _dlq.msg_id);
    RAISE LOG 'Email queued requeued_dlq_msg_id=%', _dlq.msg_id;
  END LOOP;
END
$do$;