
CREATE OR REPLACE FUNCTION public.browse_marketplace_leads()
RETURNS TABLE(
  id uuid,
  title text,
  summary text,
  details text,
  city text,
  postcode_prefix text,
  event_date date,
  event_time time without time zone,
  budget_band text,
  duration text,
  duration_days integer,
  duration_hours numeric,
  flexible_dates boolean,
  inspiration_links text[],
  expires_at timestamptz,
  created_at timestamptz,
  status text,
  kind text,
  service_name text,
  unlock_credit_cost integer,
  urgency_status text,
  max_responses integer,
  latitude double precision,
  longitude double precision,
  response_count integer,
  unlocked boolean,
  customer_first_name text,
  customer_verified_phone boolean,
  customer_frequent_user boolean,
  customer_account_age_days integer,
  customer_previous_requests integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pro AS (SELECT id FROM professionals WHERE user_id = auth.uid())
  SELECT
    j.id, j.title, j.summary, j.details, j.city, j.postcode_prefix,
    j.event_date, j.event_time, j.budget_band, j.duration, j.duration_days,
    j.duration_hours, j.flexible_dates, j.inspiration_links, j.expires_at,
    j.created_at, j.status::text, j.kind::text,
    s.name AS service_name,
    j.unlock_credit_cost, j.urgency_status, j.max_responses,
    j.latitude, j.longitude,
    COALESCE((SELECT count(*)::int FROM quote_requests qr WHERE qr.job_id = j.id), 0) AS response_count,
    EXISTS (SELECT 1 FROM lead_unlocks lu WHERE lu.job_id = j.id AND lu.professional_id = (SELECT id FROM pro)) AS unlocked,
    SPLIT_PART(COALESCE(p.full_name, ''), ' ', 1) AS customer_first_name,
    COALESCE(p.verified_phone, false),
    COALESCE(p.frequent_user, false),
    GREATEST(0, EXTRACT(DAY FROM (now() - u.created_at))::int) AS customer_account_age_days,
    COALESCE((SELECT count(*)::int FROM jobs j2 WHERE j2.customer_id = j.customer_id), 0) AS customer_previous_requests
  FROM lead_matches lm
  JOIN pro ON pro.id = lm.professional_id
  JOIN jobs j ON j.id = lm.job_id
  LEFT JOIN services s ON s.id = j.service_id
  LEFT JOIN profiles p ON p.id = j.customer_id
  LEFT JOIN auth.users u ON u.id = j.customer_id
  WHERE j.status = 'open' AND j.expires_at > now()
  ORDER BY j.created_at DESC
  LIMIT 200;
$$;

REVOKE EXECUTE ON FUNCTION public.browse_marketplace_leads() FROM anon;
GRANT EXECUTE ON FUNCTION public.browse_marketplace_leads() TO authenticated;
