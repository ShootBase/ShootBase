
ALTER TABLE public.credit_settings
  ADD COLUMN IF NOT EXISTS priority_radius_miles integer NOT NULL DEFAULT 50;

DROP FUNCTION IF EXISTS public.browse_marketplace_leads();

CREATE FUNCTION public.browse_marketplace_leads()
RETURNS TABLE(
  id uuid, title text, summary text, details text, city text, postcode_prefix text,
  event_date date, event_time time without time zone, budget_band text, duration text,
  duration_days integer, duration_hours numeric, flexible_dates boolean,
  inspiration_links text[], expires_at timestamp with time zone,
  created_at timestamp with time zone, status text, kind text, service_name text,
  event_type text, urgency text, unlock_credit_cost integer, urgency_status text,
  max_responses integer, latitude double precision, longitude double precision,
  response_count integer, unlocked boolean, client_display_name text,
  customer_first_name text, customer_verified_phone boolean,
  customer_frequent_user boolean, customer_account_age_days integer,
  customer_previous_requests integer, customer_verified boolean,
  masked_contact_email text, masked_contact_phone text,
  customer_member_since timestamp with time zone, allow_extra_pros boolean,
  distance_miles double precision, priority_radius_miles integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH pro AS (
    SELECT id, user_id, latitude, longitude
    FROM professionals WHERE user_id = auth.uid()
  ),
  settings AS (
    SELECT COALESCE(priority_radius_miles, 50) AS prio_radius
    FROM credit_settings WHERE id = 1
  ),
  eligible_jobs AS (
    SELECT DISTINCT j.id
    FROM jobs j
    JOIN pro ON true
    JOIN professional_services ps
      ON ps.professional_id = pro.id AND ps.service_id = j.service_id
    WHERE j.status = 'open' AND j.expires_at > now()
      AND j.customer_id <> pro.user_id
  )
  SELECT j.id, j.title, j.summary, j.details, j.city, j.postcode_prefix,
    j.event_date, j.event_time, j.budget_band, j.duration, j.duration_days,
    j.duration_hours, j.flexible_dates, j.inspiration_links, j.expires_at,
    j.created_at, j.status::text, j.kind::text, s.name, j.event_type, j.urgency,
    j.unlock_credit_cost, j.urgency_status, j.max_responses, j.latitude, j.longitude,
    COALESCE((SELECT count(*)::int FROM quote_requests qr WHERE qr.job_id = j.id), 0),
    EXISTS (SELECT 1 FROM lead_unlocks lu WHERE lu.job_id = j.id AND lu.professional_id = (SELECT id FROM pro)),
    CASE WHEN COALESCE(j.show_name_to_pros, true)
      THEN COALESCE(NULLIF(j.client_display_name, ''), NULLIF(j.contact_name, ''), SPLIT_PART(COALESCE(p.full_name, ''), ' ', 1))
      ELSE 'Private Client' END,
    SPLIT_PART(COALESCE(p.full_name, ''), ' ', 1),
    COALESCE(p.verified_phone, false), COALESCE(p.frequent_user, false),
    GREATEST(0, EXTRACT(DAY FROM (now() - u.created_at))::int),
    COALESCE((SELECT count(*)::int FROM jobs j2 WHERE j2.customer_id = j.customer_id), 0),
    COALESCE(p.verified, false),
    public.mask_email(u.email::text),
    public.mask_phone(COALESCE(j.contact_phone, p.phone)),
    u.created_at,
    COALESCE(j.allow_extra_pros, false),
    CASE
      WHEN (SELECT latitude FROM pro) IS NOT NULL
       AND (SELECT longitude FROM pro) IS NOT NULL
       AND j.latitude IS NOT NULL AND j.longitude IS NOT NULL
      THEN public.miles_between(
        (SELECT latitude FROM pro), (SELECT longitude FROM pro),
        j.latitude, j.longitude)
      ELSE NULL
    END,
    (SELECT prio_radius FROM settings)
  FROM eligible_jobs ej JOIN jobs j ON j.id = ej.id
  LEFT JOIN services s ON s.id = j.service_id
  LEFT JOIN profiles p ON p.id = j.customer_id
  LEFT JOIN auth.users u ON u.id = j.customer_id
  ORDER BY
    CASE
      WHEN (SELECT latitude FROM pro) IS NULL OR (SELECT longitude FROM pro) IS NULL
        OR j.latitude IS NULL OR j.longitude IS NULL THEN 5
      WHEN public.miles_between((SELECT latitude FROM pro),(SELECT longitude FROM pro),j.latitude,j.longitude) <= 10 THEN 1
      WHEN public.miles_between((SELECT latitude FROM pro),(SELECT longitude FROM pro),j.latitude,j.longitude) <= 25 THEN 2
      WHEN public.miles_between((SELECT latitude FROM pro),(SELECT longitude FROM pro),j.latitude,j.longitude) <= (SELECT prio_radius FROM settings) THEN 3
      ELSE 4
    END ASC,
    CASE j.urgency
      WHEN 'asap' THEN 1 WHEN '3-days' THEN 2 WHEN '1-week' THEN 3
      WHEN '2-weeks' THEN 4 WHEN '1-month' THEN 5 WHEN 'flexible' THEN 6
      ELSE 7 END ASC,
    j.created_at DESC
  LIMIT 200;
$function$;

GRANT EXECUTE ON FUNCTION public.browse_marketplace_leads() TO authenticated;
