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
      SELECT public.enqueue_email(
        'transactional_emails',
        jsonb_build_object(
          'template_name','pro-contact-request',
          'recipient_email', _pro_email,
          'idempotency_key', 'contact-req-' || _row.id::text,
          'template_data', jsonb_build_object(
            'clientName', _client_name,
            'jobTitle', COALESCE(_job.title,'a new project'),
            'jobCategory', _job_category,
            'city', _location,
            'eventDate', COALESCE(_job.event_date::text, ''),
            'requestUrl', 'https://www.shootbase.co.uk/pro/leads?job=' || _job_id::text
          )
        )
      ) INTO _msg_id;
      RAISE LOG 'Email queued request=% msg_id=%', _row.id, _msg_id;
    END IF;
  END IF;

  RETURN QUERY SELECT _row.id, _row.status::TEXT, _row.created_at, _was_new;
END
$function$;