
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.compute_user_verified(_u auth.users)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(_u.email_confirmed_at IS NOT NULL, FALSE)
    OR COALESCE((_u.raw_app_meta_data->>'provider') IN ('google','apple'), FALSE)
    OR COALESCE(
      EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
          COALESCE(_u.raw_app_meta_data->'providers', '[]'::jsonb)
        ) p WHERE p IN ('google','apple')
      ), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_profile_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
    SET verified = public.compute_user_verified(NEW)
    WHERE id = NEW.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_users_sync_verified ON auth.users;
CREATE TRIGGER tg_users_sync_verified
AFTER INSERT OR UPDATE OF email_confirmed_at, raw_app_meta_data ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_profile_verified();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, verified)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    public.compute_user_verified(NEW)
  )
  ON CONFLICT (id) DO UPDATE SET verified = EXCLUDED.verified;
  RETURN NEW;
END $$;

UPDATE public.profiles p
SET verified = public.compute_user_verified(u)
FROM auth.users u
WHERE u.id = p.id;

DROP FUNCTION IF EXISTS public.browse_marketplace_leads();

CREATE OR REPLACE FUNCTION public.browse_marketplace_leads()
 RETURNS TABLE(id uuid, title text, summary text, details text, city text, postcode_prefix text, event_date date, event_time time without time zone, budget_band text, duration text, duration_days integer, duration_hours numeric, flexible_dates boolean, inspiration_links text[], expires_at timestamp with time zone, created_at timestamp with time zone, status text, kind text, service_name text, event_type text, urgency text, unlock_credit_cost integer, urgency_status text, max_responses integer, latitude double precision, longitude double precision, response_count integer, unlocked boolean, client_display_name text, customer_first_name text, customer_verified_phone boolean, customer_frequent_user boolean, customer_account_age_days integer, customer_previous_requests integer, customer_verified boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pro AS (
    SELECT id, user_id, city, status, latitude, longitude, service_radius_miles,
           nationwide_service, remote_service
    FROM professionals WHERE user_id = auth.uid()
  ),
  eligible_jobs AS (
    SELECT DISTINCT j.id
    FROM jobs j
    JOIN pro ON pro.status = 'active'
    JOIN professional_services ps
      ON ps.professional_id = pro.id AND ps.service_id = j.service_id
    WHERE j.status = 'open' AND j.expires_at > now()
      AND j.customer_id <> pro.user_id
      AND public.pro_covers_job(
        pro.latitude, pro.longitude, pro.service_radius_miles,
        pro.nationwide_service, pro.remote_service,
        j.latitude, j.longitude, j.remote_ok
      )
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
    COALESCE((SELECT count(*)::int FROM jobs j2 WHERE j2.customer_id = j.customer_id), 0),
    COALESCE(p.verified, false)
  FROM eligible_jobs ej JOIN jobs j ON j.id = ej.id
  LEFT JOIN services s ON s.id = j.service_id
  LEFT JOIN profiles p ON p.id = j.customer_id
  LEFT JOIN auth.users u ON u.id = j.customer_id
  ORDER BY
    CASE j.urgency
      WHEN 'asap' THEN 1 WHEN '3-days' THEN 2 WHEN '1-week' THEN 3
      WHEN '2-weeks' THEN 4 WHEN '1-month' THEN 5 WHEN 'flexible' THEN 6
      ELSE 7
    END ASC,
    j.created_at DESC
  LIMIT 200;
$function$;
