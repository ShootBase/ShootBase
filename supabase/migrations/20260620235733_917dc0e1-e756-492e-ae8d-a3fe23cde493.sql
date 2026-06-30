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
BEGIN
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
    RETURN QUERY SELECT _existing.id, _existing.status::TEXT, _existing.created_at, FALSE;
    RETURN;
  END IF;

  INSERT INTO public.pro_contact_requests (job_id, professional_id, customer_id, status)
    VALUES (_job_id, _professional_id, auth.uid(), 'pending')
    RETURNING * INTO _row;
  _was_new := TRUE;

  INSERT INTO public.notifications (user_id, title, body, url)
    VALUES (
      _pro.user_id,
      'A client requested contact',
      'A client wants to hear from you about ' || COALESCE(_job.title,'a new project') || '.',
      '/pro/leads?job=' || _job_id::text
    );

  SELECT email::TEXT INTO _pro_email FROM auth.users WHERE auth.users.id = _pro.user_id;
  _client_name := CASE
    WHEN COALESCE(_job.show_name_to_pros, true) THEN
      COALESCE(NULLIF(_job.client_display_name,''), NULLIF(_job.contact_name,''), 'A client')
    ELSE 'A client' END;

  IF _pro_email IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.suppressed_emails se WHERE se.email = lower(_pro_email)) INTO _suppressed;
    IF NOT _suppressed THEN
      BEGIN
        PERFORM public.enqueue_email(
          'transactional_emails',
          jsonb_build_object(
            'template_name','pro-contact-request',
            'recipient_email', _pro_email,
            'idempotency_key', 'contact-req-' || _row.id::text,
            'template_data', jsonb_build_object(
              'clientName', _client_name,
              'jobTitle', COALESCE(_job.title,'a new project'),
              'city', _job.city,
              'eventDate', COALESCE(_job.event_date::text, ''),
              'requestUrl', 'https://www.shootbase.co.uk/pro/leads?job=' || _job_id::text
            )
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'enqueue_email failed for contact request %: %', _row.id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN QUERY SELECT _row.id, _row.status::TEXT, _row.created_at, _was_new;
END
$function$;