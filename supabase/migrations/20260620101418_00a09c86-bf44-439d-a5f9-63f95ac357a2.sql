
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS urgency TEXT;

CREATE OR REPLACE FUNCTION public.calculate_lead_credits(_hours numeric, _budget_band text DEFAULT NULL)
 RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN (_hours IS NOT NULL AND _hours >= 6)
      OR _budget_band IN ('500-1000', '1000-2500', '2500+')
    THEN 10 ELSE 5 END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_jobs_compute_marketplace()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE _hours numeric;
BEGIN
  _hours := NEW.duration_hours;
  IF _hours IS NULL AND NEW.duration_days IS NOT NULL THEN _hours := NEW.duration_days * 8; END IF;
  NEW.duration_hours := _hours;
  NEW.unlock_credit_cost := public.calculate_lead_credits(_hours, NEW.budget_band);
  NEW.urgency_status := CASE WHEN NEW.event_date IS NOT NULL AND NEW.event_date <= (CURRENT_DATE + INTERVAL '7 days')::date THEN 'urgent' ELSE 'normal' END;
  RETURN NEW;
END $function$;

UPDATE public.jobs SET unlock_credit_cost = public.calculate_lead_credits(duration_hours, budget_band) WHERE status = 'open';
UPDATE public.credit_settings SET unlock_cost = 5 WHERE id = 1 AND unlock_cost = 8;

DROP FUNCTION IF EXISTS public.browse_marketplace_leads();
CREATE OR REPLACE FUNCTION public.browse_marketplace_leads()
 RETURNS TABLE(id uuid, title text, summary text, details text, city text, postcode_prefix text, event_date date, event_time time without time zone, budget_band text, duration text, duration_days integer, duration_hours numeric, flexible_dates boolean, inspiration_links text[], expires_at timestamp with time zone, created_at timestamp with time zone, status text, kind text, service_name text, event_type text, urgency text, unlock_credit_cost integer, urgency_status text, max_responses integer, latitude double precision, longitude double precision, response_count integer, unlocked boolean, customer_first_name text, customer_verified_phone boolean, customer_frequent_user boolean, customer_account_age_days integer, customer_previous_requests integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
    SPLIT_PART(COALESCE(p.full_name, ''), ' ', 1),
    COALESCE(p.verified_phone, false), COALESCE(p.frequent_user, false),
    GREATEST(0, EXTRACT(DAY FROM (now() - u.created_at))::int),
    COALESCE((SELECT count(*)::int FROM jobs j2 WHERE j2.customer_id = j.customer_id), 0)
  FROM eligible_jobs ej JOIN jobs j ON j.id = ej.id
  LEFT JOIN services s ON s.id = j.service_id
  LEFT JOIN profiles p ON p.id = j.customer_id
  LEFT JOIN auth.users u ON u.id = j.customer_id
  ORDER BY (j.city ILIKE (SELECT city FROM pro)) DESC,
    EXISTS (SELECT 1 FROM lead_matches lm2 WHERE lm2.job_id = j.id AND lm2.professional_id = (SELECT id FROM pro)) DESC,
    j.created_at DESC LIMIT 200;
$function$;
