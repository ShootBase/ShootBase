
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS client_display_name TEXT,
  ADD COLUMN IF NOT EXISTS show_name_to_pros BOOLEAN NOT NULL DEFAULT true;

-- Backfill from contact_name where possible
UPDATE public.jobs SET client_display_name = contact_name WHERE client_display_name IS NULL AND contact_name IS NOT NULL;

-- Replace browse_marketplace_leads to include resolved client display name + urgency ordering
DROP FUNCTION IF EXISTS public.browse_marketplace_leads();
CREATE OR REPLACE FUNCTION public.browse_marketplace_leads()
 RETURNS TABLE(id uuid, title text, summary text, details text, city text, postcode_prefix text, event_date date, event_time time without time zone, budget_band text, duration text, duration_days integer, duration_hours numeric, flexible_dates boolean, inspiration_links text[], expires_at timestamp with time zone, created_at timestamp with time zone, status text, kind text, service_name text, event_type text, urgency text, unlock_credit_cost integer, urgency_status text, max_responses integer, latitude double precision, longitude double precision, response_count integer, unlocked boolean, client_display_name text, customer_first_name text, customer_verified_phone boolean, customer_frequent_user boolean, customer_account_age_days integer, customer_previous_requests integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pro AS (SELECT id, city, status FROM professionals WHERE user_id = auth.uid()),
  eligible_jobs AS (
    SELECT DISTINCT j.id FROM jobs j JOIN pro ON pro.status = 'active'
    LEFT JOIN professional_services ps ON ps.professional_id = pro.id AND ps.service_id = j.service_id
    LEFT JOIN lead_matches lm ON lm.job_id = j.id AND lm.professional_id = pro.id
    WHERE j.status = 'open' AND j.expires_at > now()
      AND (lm.job_id IS NOT NULL OR ps.service_id IS NOT NULL)
  )
  SELECT j.id, j.title, j.summary, j.details, j.city, j.postcode_prefix,
    j.event_date, j.event_time, j.budget_band, j.duration, j.duration_days,
    j.duration_hours, j.flexible_dates, j.inspiration_links, j.expires_at,
    j.created_at, j.status::text, j.kind::text, s.name, j.event_type, j.urgency,
    j.unlock_credit_cost, j.urgency_status, j.max_responses, j.latitude, j.longitude,
    COALESCE((SELECT count(*)::int FROM quote_requests qr WHERE qr.job_id = j.id), 0),
    EXISTS (SELECT 1 FROM lead_unlocks lu WHERE lu.job_id = j.id AND lu.professional_id = (SELECT id FROM pro)),
    CASE WHEN COALESCE(j.show_name_to_pros, true) THEN COALESCE(NULLIF(j.client_display_name, ''), NULLIF(j.contact_name, ''), SPLIT_PART(COALESCE(p.full_name, ''), ' ', 1))
         ELSE 'Private Client' END,
    SPLIT_PART(COALESCE(p.full_name, ''), ' ', 1),
    COALESCE(p.verified_phone, false), COALESCE(p.frequent_user, false),
    GREATEST(0, EXTRACT(DAY FROM (now() - u.created_at))::int),
    COALESCE((SELECT count(*)::int FROM jobs j2 WHERE j2.customer_id = j.customer_id), 0)
  FROM eligible_jobs ej JOIN jobs j ON j.id = ej.id
  LEFT JOIN services s ON s.id = j.service_id
  LEFT JOIN profiles p ON p.id = j.customer_id
  LEFT JOIN auth.users u ON u.id = j.customer_id
  ORDER BY
    CASE j.urgency
      WHEN 'asap' THEN 1
      WHEN '3-days' THEN 2
      WHEN '1-week' THEN 3
      WHEN '2-weeks' THEN 4
      WHEN '1-month' THEN 5
      WHEN 'flexible' THEN 6
      ELSE 7
    END ASC,
    (j.city ILIKE (SELECT city FROM pro)) DESC,
    EXISTS (SELECT 1 FROM lead_matches lm2 WHERE lm2.job_id = j.id AND lm2.professional_id = (SELECT id FROM pro)) DESC,
    j.created_at DESC LIMIT 200;
$function$;

-- Replace my_pro_threads to add client_display_name resolution
DROP FUNCTION IF EXISTS public.my_pro_threads();
CREATE OR REPLACE FUNCTION public.my_pro_threads()
 RETURNS TABLE(qr_id uuid, job_id uuid, title text, city text, event_date date, event_time time without time zone, budget_band text, details text, customer_id uuid, customer_name text, client_display_name text, customer_email text, customer_phone text, last_message_at timestamp with time zone, last_message_body text, last_message_sender uuid, last_message_source text, unread_count integer, status text, client_status text, archived_by_pro boolean, hired boolean, closed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pro AS (SELECT id, user_id FROM professionals WHERE user_id = auth.uid())
  SELECT
    qr.id, qr.job_id, COALESCE(j.title, 'Conversation'), COALESCE(j.city, qr.location, ''),
    j.event_date, j.event_time, COALESCE(qr.budget_band, j.budget_band), COALESCE(j.details, qr.details),
    qr.customer_id, p.full_name,
    CASE WHEN COALESCE(j.show_name_to_pros, true) THEN COALESCE(NULLIF(j.client_display_name, ''), NULLIF(j.contact_name, ''), p.full_name)
         ELSE 'Private Client' END,
    u.email::TEXT, p.phone, qr.last_message_at,
    (SELECT body FROM messages WHERE quote_request_id = qr.id ORDER BY created_at DESC LIMIT 1),
    (SELECT sender_id FROM messages WHERE quote_request_id = qr.id ORDER BY created_at DESC LIMIT 1),
    (SELECT source FROM messages WHERE quote_request_id = qr.id ORDER BY created_at DESC LIMIT 1),
    (SELECT count(*)::int FROM messages WHERE quote_request_id = qr.id AND sender_id <> (SELECT user_id FROM pro) AND read_at IS NULL),
    qr.status::TEXT, qr.client_status, qr.archived_by_pro, qr.hired, qr.closed
  FROM quote_requests qr
  JOIN pro ON pro.id = qr.professional_id
  LEFT JOIN jobs j ON j.id = qr.job_id
  JOIN profiles p ON p.id = qr.customer_id
  JOIN auth.users u ON u.id = qr.customer_id
  WHERE qr.deleted_by_pro = FALSE
  ORDER BY qr.last_message_at DESC NULLS LAST;
$function$;
