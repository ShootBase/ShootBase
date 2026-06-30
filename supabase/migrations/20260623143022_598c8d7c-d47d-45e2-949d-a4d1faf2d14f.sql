
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.client_phone_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_phone_otps_user_idx ON public.client_phone_otps(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.client_phone_otps TO authenticated;
GRANT ALL ON public.client_phone_otps TO service_role;
ALTER TABLE public.client_phone_otps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "otp_self_manage" ON public.client_phone_otps;
CREATE POLICY "otp_self_manage" ON public.client_phone_otps
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.request_client_phone_otp(_phone TEXT)
RETURNS TABLE(otp_id UUID, dev_code TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid UUID; _code TEXT; _id UUID; _exp TIMESTAMPTZ; _norm TEXT;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  _norm := regexp_replace(COALESCE(_phone,''), '\s+', '', 'g');
  IF length(_norm) < 7 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  IF (SELECT count(*) FROM public.client_phone_otps WHERE user_id = _uid AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  UPDATE public.client_phone_otps SET consumed_at = now() WHERE user_id = _uid AND consumed_at IS NULL;
  _code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  _exp  := now() + interval '10 minutes';
  INSERT INTO public.client_phone_otps (user_id, phone, code, expires_at)
    VALUES (_uid, _norm, _code, _exp) RETURNING id INTO _id;
  UPDATE public.profiles
    SET phone = _norm, verified_phone = FALSE, phone_verified_at = NULL
    WHERE id = _uid;
  RETURN QUERY SELECT _id, _code, _exp;
END $$;
REVOKE ALL ON FUNCTION public.request_client_phone_otp(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_client_phone_otp(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_client_phone_otp(_code TEXT)
RETURNS TABLE(verified BOOLEAN, phone TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid UUID; _row RECORD;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _row FROM public.client_phone_otps
    WHERE user_id = _uid AND consumed_at IS NULL
    ORDER BY created_at DESC LIMIT 1;
  IF _row IS NULL THEN RAISE EXCEPTION 'no_active_code'; END IF;
  IF _row.expires_at < now() THEN RAISE EXCEPTION 'code_expired'; END IF;
  IF _row.attempts >= 5 THEN RAISE EXCEPTION 'too_many_attempts'; END IF;
  IF trim(_code) <> _row.code THEN
    UPDATE public.client_phone_otps SET attempts = attempts + 1 WHERE id = _row.id;
    RAISE EXCEPTION 'invalid_code';
  END IF;
  UPDATE public.client_phone_otps SET consumed_at = now() WHERE id = _row.id;
  UPDATE public.profiles
    SET phone = _row.phone, verified_phone = TRUE, phone_verified_at = now()
    WHERE id = _uid;
  INSERT INTO public.admin_audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (_uid, 'user.phone_verified', 'user', _uid::text,
            jsonb_build_object('phone', _row.phone, 'source','otp'));
  RETURN QUERY SELECT TRUE, _row.phone;
END $$;
REVOKE ALL ON FUNCTION public.verify_client_phone_otp(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_client_phone_otp(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_phone_verified(_user_id UUID, _verified BOOLEAN, _reason TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_staff_permission(auth.uid(), 'users.edit'::public.staff_permission) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  UPDATE public.profiles
    SET verified_phone = _verified,
        phone_verified_at = CASE WHEN _verified THEN now() ELSE NULL END
    WHERE id = _user_id;
  PERFORM public.log_admin_action(
    CASE WHEN _verified THEN 'user.phone_verify' ELSE 'user.phone_unverify' END,
    'user', _user_id::text,
    jsonb_build_object('reason', _reason, 'manual', true)
  );
END $$;
REVOKE ALL ON FUNCTION public.admin_set_phone_verified(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_phone_verified(UUID, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.mask_email(_email TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE _at INT; _local TEXT; _dom TEXT; _dot INT; _name TEXT; _tld TEXT;
BEGIN
  IF _email IS NULL OR position('@' in _email) = 0 THEN RETURN NULL; END IF;
  _at := position('@' in _email);
  _local := substring(_email FROM 1 FOR _at - 1);
  _dom := substring(_email FROM _at + 1);
  _dot := position('.' in _dom);
  IF _dot = 0 THEN _name := _dom; _tld := '';
  ELSE _name := substring(_dom FROM 1 FOR _dot - 1); _tld := substring(_dom FROM _dot); END IF;
  RETURN substring(_local FROM 1 FOR LEAST(2, length(_local))) || '•••••' || '@' ||
         substring(_name FROM 1 FOR LEAST(2, length(_name))) || '•••' || _tld;
END $$;

CREATE OR REPLACE FUNCTION public.mask_phone(_phone TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE _d TEXT; _l INT;
BEGIN
  IF _phone IS NULL THEN RETURN NULL; END IF;
  _d := regexp_replace(_phone, '\D', '', 'g');
  _l := length(_d);
  IF _l < 6 THEN RETURN '•••'; END IF;
  RETURN substring(_d FROM 1 FOR 3) || '•••••' || substring(_d FROM _l - 2);
END $$;

DROP FUNCTION IF EXISTS public.browse_marketplace_leads();
CREATE OR REPLACE FUNCTION public.browse_marketplace_leads()
 RETURNS TABLE(id uuid, title text, summary text, details text, city text, postcode_prefix text,
   event_date date, event_time time without time zone, budget_band text, duration text,
   duration_days integer, duration_hours numeric, flexible_dates boolean,
   inspiration_links text[], expires_at timestamp with time zone, created_at timestamp with time zone,
   status text, kind text, service_name text, event_type text, urgency text,
   unlock_credit_cost integer, urgency_status text, max_responses integer,
   latitude double precision, longitude double precision, response_count integer, unlocked boolean,
   client_display_name text, customer_first_name text, customer_verified_phone boolean,
   customer_frequent_user boolean, customer_account_age_days integer, customer_previous_requests integer,
   customer_verified boolean,
   masked_contact_email text, masked_contact_phone text,
   customer_member_since timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH pro AS (
    SELECT id, user_id, city, status, latitude, longitude, service_radius_miles,
           nationwide_service, remote_service
    FROM professionals WHERE user_id = auth.uid()
  ),
  eligible_jobs AS (
    SELECT DISTINCT j.id
    FROM jobs j JOIN pro ON pro.status = 'active'
    JOIN professional_services ps ON ps.professional_id = pro.id AND ps.service_id = j.service_id
    WHERE j.status = 'open' AND j.expires_at > now()
      AND j.customer_id <> pro.user_id
      AND public.pro_covers_job(
        pro.latitude, pro.longitude, pro.service_radius_miles,
        pro.nationwide_service, pro.remote_service,
        j.latitude, j.longitude, j.remote_ok)
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
    COALESCE(p.verified, false),
    public.mask_email(u.email::text),
    public.mask_phone(COALESCE(j.contact_phone, p.phone)),
    u.created_at
  FROM eligible_jobs ej JOIN jobs j ON j.id = ej.id
  LEFT JOIN services s ON s.id = j.service_id
  LEFT JOIN profiles p ON p.id = j.customer_id
  LEFT JOIN auth.users u ON u.id = j.customer_id
  ORDER BY
    CASE j.urgency
      WHEN 'asap' THEN 1 WHEN '3-days' THEN 2 WHEN '1-week' THEN 3
      WHEN '2-weeks' THEN 4 WHEN '1-month' THEN 5 WHEN 'flexible' THEN 6
      ELSE 7 END ASC,
    j.created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.tg_reset_phone_verification()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    IF NEW.verified_phone IS NOT DISTINCT FROM OLD.verified_phone THEN
      NEW.verified_phone := FALSE;
      NEW.phone_verified_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_reset_phone_verify ON public.profiles;
CREATE TRIGGER profiles_reset_phone_verify
  BEFORE UPDATE OF phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_reset_phone_verification();
