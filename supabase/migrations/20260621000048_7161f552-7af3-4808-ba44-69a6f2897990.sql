CREATE OR REPLACE FUNCTION public.can_review_pro(_pro_id uuid, _job_id uuid)
 RETURNS TABLE(eligible boolean, reason text, quote_request_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_variable
DECLARE _qr_id uuid; _msg_count int; _existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'not_authenticated'::text, NULL::uuid; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.customer_id = auth.uid()) THEN
    RETURN QUERY SELECT false, 'not_your_job'::text, NULL::uuid; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lead_unlocks lu WHERE lu.job_id = _job_id AND lu.professional_id = _pro_id) THEN
    RETURN QUERY SELECT false, 'not_unlocked'::text, NULL::uuid; RETURN;
  END IF;
  SELECT qr.id INTO _qr_id FROM public.quote_requests qr
    WHERE qr.job_id = _job_id AND qr.professional_id = _pro_id AND qr.customer_id = auth.uid()
    ORDER BY qr.created_at DESC LIMIT 1;
  IF _qr_id IS NULL THEN
    RETURN QUERY SELECT false, 'no_thread'::text, NULL::uuid; RETURN;
  END IF;
  SELECT count(*) INTO _msg_count FROM public.messages m WHERE m.quote_request_id = _qr_id;
  IF _msg_count < 1 THEN
    RETURN QUERY SELECT false, 'no_messages'::text, _qr_id; RETURN;
  END IF;
  SELECT r.id INTO _existing FROM public.reviews r
    WHERE r.quote_request_id = _qr_id AND r.customer_id = auth.uid();
  IF _existing IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_reviewed'::text, _qr_id; RETURN;
  END IF;
  RETURN QUERY SELECT true, 'eligible'::text, _qr_id;
END $function$;