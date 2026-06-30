CREATE OR REPLACE FUNCTION public.my_matching_leads()
 RETURNS TABLE(notification_id uuid, job_id uuid, created_at timestamp with time zone, email_status text, title text, city text, service_name text, event_date date, budget_band text, summary text, urgency text, unlocked boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pro AS (SELECT id, user_id FROM public.professionals WHERE user_id = auth.uid())
  SELECT lmn.id, j.id, lmn.created_at, lmn.email_status,
         j.title, j.city, s.name, j.event_date, j.budget_band, j.summary, j.urgency,
         EXISTS (
           SELECT 1 FROM public.lead_unlocks lu
           WHERE lu.job_id = j.id AND lu.professional_id = (SELECT id FROM pro)
         )
  FROM public.lead_match_notifications lmn
  JOIN public.jobs j ON j.id = lmn.job_id
  LEFT JOIN public.services s ON s.id = j.service_id
  WHERE lmn.professional_id = (SELECT id FROM pro)
    AND j.status = 'open'
    AND j.expires_at > now()
    -- Exclude leads the Pro has already unlocked (already paid to contact)
    AND NOT EXISTS (
      SELECT 1 FROM public.lead_unlocks lu
      WHERE lu.job_id = j.id AND lu.professional_id = (SELECT id FROM pro)
    )
    -- Exclude leads the Pro has dismissed / marked not interested
    AND NOT EXISTS (
      SELECT 1 FROM public.pro_lead_dismissals d
      WHERE d.job_id = j.id AND d.professional_id = (SELECT id FROM pro)
    )
    -- Exclude leads where the Pro has already messaged the client
    AND NOT EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.quote_requests qr ON qr.id = m.quote_request_id
      WHERE qr.job_id = j.id
        AND qr.professional_id = (SELECT id FROM pro)
        AND m.sender_id = (SELECT user_id FROM pro)
    )
  ORDER BY lmn.created_at DESC
  LIMIT 50;
$function$;