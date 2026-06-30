
-- ============================================================
-- 1. Status enum + table
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.contact_request_status AS ENUM ('pending','viewed','unlocked','responded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.pro_contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  status public.contact_request_status NOT NULL DEFAULT 'pending',
  viewed_at TIMESTAMPTZ,
  unlocked_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, professional_id)
);

CREATE INDEX IF NOT EXISTS pro_contact_requests_pro_idx ON public.pro_contact_requests(professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pro_contact_requests_job_idx ON public.pro_contact_requests(job_id);
CREATE INDEX IF NOT EXISTS pro_contact_requests_customer_idx ON public.pro_contact_requests(customer_id);

GRANT SELECT, INSERT, UPDATE ON public.pro_contact_requests TO authenticated;
GRANT ALL ON public.pro_contact_requests TO service_role;

ALTER TABLE public.pro_contact_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients see their own contact requests" ON public.pro_contact_requests;
CREATE POLICY "Clients see their own contact requests" ON public.pro_contact_requests
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Pros see contact requests addressed to them" ON public.pro_contact_requests;
CREATE POLICY "Pros see contact requests addressed to them" ON public.pro_contact_requests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = pro_contact_requests.professional_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Clients insert their own contact requests" ON public.pro_contact_requests;
CREATE POLICY "Clients insert their own contact requests" ON public.pro_contact_requests
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "Pros update their own contact requests" ON public.pro_contact_requests;
CREATE POLICY "Pros update their own contact requests" ON public.pro_contact_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = pro_contact_requests.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = pro_contact_requests.professional_id AND p.user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_pro_contact_requests_updated_at ON public.pro_contact_requests;
CREATE TRIGGER trg_pro_contact_requests_updated_at
  BEFORE UPDATE ON public.pro_contact_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 2. Reputation columns on professionals (safe defaults)
-- ============================================================
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS response_rate_pct INTEGER,
  ADD COLUMN IF NOT EXISTS avg_response_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS successful_intros INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_completeness_pct INTEGER NOT NULL DEFAULT 0;

-- Helper: compute profile completeness for one professional row
CREATE OR REPLACE FUNCTION public.compute_profile_completeness(_pro public.professionals)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT (
    (CASE WHEN COALESCE(_pro.avatar_path,'') <> '' OR COALESCE(_pro.logo_url,'') <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN COALESCE(_pro.about,'') <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN COALESCE(_pro.business_name,'') <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN COALESCE(_pro.city,'') <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN COALESCE(_pro.website,'') <> '' OR COALESCE(_pro.instagram,'') <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN _pro.starting_price_pence IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN _pro.latitude IS NOT NULL AND _pro.longitude IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN _pro.is_verified THEN 1 ELSE 0 END)
  ) * 100 / 8;
$$;

UPDATE public.professionals
  SET profile_completeness_pct = public.compute_profile_completeness(professionals.*)
  WHERE TRUE;

CREATE OR REPLACE FUNCTION public.tg_set_profile_completeness()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.profile_completeness_pct := public.compute_profile_completeness(NEW);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_professionals_completeness ON public.professionals;
CREATE TRIGGER trg_professionals_completeness
  BEFORE INSERT OR UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_profile_completeness();

-- ============================================================
-- 3. suggest_pros_for_job — ranked list, owner-only
-- ============================================================
CREATE OR REPLACE FUNCTION public.suggest_pros_for_job(_job_id UUID)
RETURNS TABLE (
  professional_id UUID,
  slug TEXT,
  business_name TEXT,
  city TEXT,
  about TEXT,
  is_verified BOOLEAN,
  avatar_path TEXT,
  rating_avg NUMERIC,
  rating_count INTEGER,
  distance_miles DOUBLE PRECISION,
  service_name TEXT,
  response_rate_pct INTEGER,
  avg_response_minutes INTEGER,
  successful_intros INTEGER,
  profile_completeness_pct INTEGER,
  already_invited BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

GRANT EXECUTE ON FUNCTION public.suggest_pros_for_job(UUID) TO authenticated;

-- ============================================================
-- 4. request_pro_contact — create invite + notification + email
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_pro_contact(_job_id UUID, _professional_id UUID)
RETURNS TABLE (id UUID, status TEXT, created_at TIMESTAMPTZ, was_new BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id;
  IF _job IS NULL THEN RAISE EXCEPTION 'job_not_found'; END IF;
  IF _job.customer_id <> auth.uid() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT id, user_id, business_name, contact_name, status INTO _pro
    FROM public.professionals WHERE id = _professional_id;
  IF _pro IS NULL OR _pro.status <> 'active' THEN RAISE EXCEPTION 'pro_unavailable'; END IF;

  SELECT * INTO _existing FROM public.pro_contact_requests
    WHERE job_id = _job_id AND professional_id = _professional_id;
  IF _existing.id IS NOT NULL THEN
    RETURN QUERY SELECT _existing.id, _existing.status::TEXT, _existing.created_at, FALSE;
    RETURN;
  END IF;

  INSERT INTO public.pro_contact_requests (job_id, professional_id, customer_id, status)
    VALUES (_job_id, _professional_id, auth.uid(), 'pending')
    RETURNING * INTO _row;
  _was_new := TRUE;

  -- In-app notification
  INSERT INTO public.notifications (user_id, title, body, url)
    VALUES (
      _pro.user_id,
      'A client requested contact',
      'A client wants to hear from you about ' || COALESCE(_job.title,'a new project') || '.',
      '/pro/leads?job=' || _job_id::text
    );

  -- Email (respect suppression list; don't fail the request if email fails)
  SELECT email::TEXT INTO _pro_email FROM auth.users WHERE id = _pro.user_id;
  _client_name := CASE
    WHEN COALESCE(_job.show_name_to_pros, true) THEN
      COALESCE(NULLIF(_job.client_display_name,''), NULLIF(_job.contact_name,''), 'A client')
    ELSE 'A client' END;

  IF _pro_email IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.suppressed_emails WHERE email = lower(_pro_email)) INTO _suppressed;
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
END $$;

GRANT EXECUTE ON FUNCTION public.request_pro_contact(UUID, UUID) TO authenticated;

-- ============================================================
-- 5. mark_contact_request_viewed (pro side)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_contact_request_viewed(_job_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _pro_id UUID;
BEGIN
  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = auth.uid();
  IF _pro_id IS NULL THEN RETURN; END IF;
  UPDATE public.pro_contact_requests
    SET status = 'viewed', viewed_at = COALESCE(viewed_at, now())
    WHERE job_id = _job_id AND professional_id = _pro_id AND status = 'pending';
END $$;

GRANT EXECUTE ON FUNCTION public.mark_contact_request_viewed(UUID) TO authenticated;

-- ============================================================
-- 6. Triggers: unlock + respond status transitions
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_contact_request_on_unlock()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pro_contact_requests
    SET status = 'unlocked', unlocked_at = COALESCE(unlocked_at, now())
    WHERE job_id = NEW.job_id AND professional_id = NEW.professional_id
      AND status IN ('pending','viewed');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contact_request_on_unlock ON public.lead_unlocks;
CREATE TRIGGER trg_contact_request_on_unlock
  AFTER INSERT ON public.lead_unlocks
  FOR EACH ROW EXECUTE FUNCTION public.tg_contact_request_on_unlock();

CREATE OR REPLACE FUNCTION public.tg_contact_request_on_pro_message()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _qr RECORD; _pro_user UUID;
BEGIN
  SELECT * INTO _qr FROM public.quote_requests WHERE id = NEW.quote_request_id;
  IF _qr IS NULL OR _qr.job_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO _pro_user FROM public.professionals WHERE id = _qr.professional_id;
  IF _pro_user IS NULL OR NEW.sender_id <> _pro_user THEN RETURN NEW; END IF;
  UPDATE public.pro_contact_requests
    SET status = 'responded', responded_at = COALESCE(responded_at, now())
    WHERE job_id = _qr.job_id AND professional_id = _qr.professional_id
      AND status <> 'responded';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contact_request_on_pro_message ON public.messages;
CREATE TRIGGER trg_contact_request_on_pro_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_contact_request_on_pro_message();

-- ============================================================
-- 7. my_client_contact_requests (pro dashboard list)
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_client_contact_requests()
RETURNS TABLE (
  id UUID,
  job_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  unlocked_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  title TEXT,
  city TEXT,
  event_date DATE,
  budget_band TEXT,
  service_name TEXT,
  unlocked BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH pro AS (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  SELECT
    cr.id, cr.job_id, cr.status::TEXT, cr.created_at, cr.viewed_at, cr.unlocked_at, cr.responded_at,
    j.title, j.city, j.event_date, j.budget_band, s.name,
    EXISTS (SELECT 1 FROM public.lead_unlocks lu WHERE lu.job_id = cr.job_id AND lu.professional_id = cr.professional_id)
  FROM public.pro_contact_requests cr
  JOIN pro ON pro.id = cr.professional_id
  JOIN public.jobs j ON j.id = cr.job_id
  LEFT JOIN public.services s ON s.id = j.service_id
  ORDER BY cr.created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.my_client_contact_requests() TO authenticated;

-- ============================================================
-- 8. my_invited_pros (client dashboard, per job)
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_invited_pros(_job_id UUID)
RETURNS TABLE (
  id UUID,
  professional_id UUID,
  slug TEXT,
  business_name TEXT,
  city TEXT,
  avatar_path TEXT,
  is_verified BOOLEAN,
  status TEXT,
  created_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  unlocked_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = _job_id AND customer_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT cr.id, pr.id, pr.slug, pr.business_name, pr.city, pr.avatar_path, pr.is_verified,
         cr.status::TEXT, cr.created_at, cr.viewed_at, cr.unlocked_at, cr.responded_at
  FROM public.pro_contact_requests cr
  JOIN public.professionals pr ON pr.id = cr.professional_id
  WHERE cr.job_id = _job_id
  ORDER BY cr.created_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.my_invited_pros(UUID) TO authenticated;
