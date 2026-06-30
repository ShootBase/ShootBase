
CREATE OR REPLACE FUNCTION public.suggest_pros_for_job(_job_id uuid)
 RETURNS TABLE(professional_id uuid, slug text, business_name text, city text, about text, is_verified boolean, avatar_path text, rating_avg numeric, rating_count integer, distance_miles double precision, service_name text, response_rate_pct integer, avg_response_minutes integer, successful_intros integer, profile_completeness_pct integer, already_invited boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _job RECORD;
BEGIN
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id;
  IF _job IS NULL THEN RETURN; END IF;
  IF _job.customer_id <> auth.uid() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.slug,
    pr.business_name,
    pr.city,
    LEFT(COALESCE(pr.about,''), 200),
    pr.is_verified,
    pr.avatar_path,
    pr.rating_avg,
    pr.rating_count,
    public.miles_between(pr.latitude, pr.longitude, _job.latitude, _job.longitude),
    s.name,
    pr.response_rate_pct,
    pr.avg_response_minutes,
    pr.successful_intros,
    pr.profile_completeness_pct,
    EXISTS (SELECT 1 FROM public.pro_contact_requests cr WHERE cr.job_id = _job_id AND cr.professional_id = pr.id)
  FROM public.professionals pr
  JOIN public.professional_services ps ON ps.professional_id = pr.id AND ps.service_id = _job.service_id
  LEFT JOIN public.services s ON s.id = _job.service_id
  WHERE pr.status = 'active'
    AND pr.user_id <> auth.uid()
    AND public.pro_covers_job(
      pr.latitude, pr.longitude, pr.service_radius_miles,
      pr.nationwide_service, pr.remote_service,
      _job.latitude, _job.longitude, _job.remote_ok
    )
  ORDER BY
    COALESCE(public.miles_between(pr.latitude, pr.longitude, _job.latitude, _job.longitude), 9999) ASC,
    COALESCE(pr.response_rate_pct, 0) DESC,
    pr.successful_intros DESC,
    pr.profile_completeness_pct DESC,
    pr.rating_avg DESC NULLS LAST
  LIMIT 12;
END $function$;

-- Guard against self-invite at the request layer as well
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
  IF _pro.user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_request_self'; END IF;

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

  RETURN QUERY SELECT _row.id, _row.status::TEXT, _row.created_at, TRUE;
END $function$;
