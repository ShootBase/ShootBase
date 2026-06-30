
-- ============================================================
-- Part 1: tiny country-scope additions for admin tables
-- ============================================================

-- Add country to promo_codes (NULL = global, applies to both countries)
ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS country text;

-- ============================================================
-- Part 2: Portfolio Videos schema
-- ============================================================

-- Eligibility view: a pro is eligible if any of their services has kind='videography'
CREATE OR REPLACE VIEW public.professional_video_eligibility AS
SELECT
  p.id AS professional_id,
  EXISTS (
    SELECT 1
    FROM public.professional_services ps
    JOIN public.services s ON s.id = ps.service_id
    WHERE ps.professional_id = p.id
      AND s.kind = 'videography'
  ) AS is_eligible
FROM public.professionals p;

GRANT SELECT ON public.professional_video_eligibility TO authenticated, anon;

-- Video status enum
DO $$ BEGIN
  CREATE TYPE public.portfolio_video_status AS ENUM ('uploading','processing','ready','failed','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.portfolio_video_report_reason AS ENUM ('inappropriate','copyright','spam','wrong_category','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.portfolio_video_report_status AS ENUM ('open','dismissed','actioned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------
-- portfolio_videos
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portfolio_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  country text,
  provider text NOT NULL DEFAULT 'cloudflare',
  provider_asset_id text,
  playback_url text,
  thumbnail_url text,
  duration_seconds integer,
  size_bytes bigint,
  width integer,
  height integer,
  title text,
  status public.portfolio_video_status NOT NULL DEFAULT 'uploading',
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  report_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_videos_pro ON public.portfolio_videos(professional_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_videos_country ON public.portfolio_videos(country);
CREATE INDEX IF NOT EXISTS idx_portfolio_videos_status ON public.portfolio_videos(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_videos TO authenticated;
GRANT SELECT ON public.portfolio_videos TO anon;
GRANT ALL ON public.portfolio_videos TO service_role;

ALTER TABLE public.portfolio_videos ENABLE ROW LEVEL SECURITY;

-- Anyone can view ready+active videos (for public profile)
CREATE POLICY "Public read ready videos" ON public.portfolio_videos
  FOR SELECT
  USING (status = 'ready' AND is_active = true);

-- Professional owns their own rows
CREATE POLICY "Pros manage own videos" ON public.portfolio_videos
  FOR ALL
  TO authenticated
  USING (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  )
  WITH CHECK (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  );

-- Staff scoped read/update by country
CREATE POLICY "Staff read videos by country" ON public.portfolio_videos
  FOR SELECT
  TO authenticated
  USING (public.staff_can_see_country(auth.uid(), country));

CREATE POLICY "Staff update videos by country" ON public.portfolio_videos
  FOR UPDATE
  TO authenticated
  USING (public.staff_can_see_country(auth.uid(), country))
  WITH CHECK (public.staff_can_see_country(auth.uid(), country));

CREATE POLICY "Staff delete videos by country" ON public.portfolio_videos
  FOR DELETE
  TO authenticated
  USING (public.staff_can_see_country(auth.uid(), country));

-- Auto-stamp country from professional
CREATE OR REPLACE FUNCTION public.tg_portfolio_video_stamp_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL THEN
    SELECT country INTO NEW.country FROM public.professionals WHERE id = NEW.professional_id;
    IF NEW.country IS NULL THEN NEW.country := 'United Kingdom'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portfolio_videos_country_stamp ON public.portfolio_videos;
CREATE TRIGGER portfolio_videos_country_stamp
  BEFORE INSERT ON public.portfolio_videos
  FOR EACH ROW EXECUTE FUNCTION public.tg_portfolio_video_stamp_country();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_portfolio_video_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS portfolio_videos_updated_at ON public.portfolio_videos;
CREATE TRIGGER portfolio_videos_updated_at
  BEFORE UPDATE ON public.portfolio_videos
  FOR EACH ROW EXECUTE FUNCTION public.tg_portfolio_video_updated_at();

-- Enforce max 2 ACTIVE videos per professional
CREATE OR REPLACE FUNCTION public.tg_portfolio_video_max_two()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  active_count int;
BEGIN
  IF NEW.is_active = true THEN
    SELECT COUNT(*) INTO active_count
    FROM public.portfolio_videos
    WHERE professional_id = NEW.professional_id
      AND is_active = true
      AND id <> COALESCE(NEW.id, gen_random_uuid());
    IF active_count >= 2 THEN
      RAISE EXCEPTION 'max_videos_reached' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portfolio_videos_max_two ON public.portfolio_videos;
CREATE TRIGGER portfolio_videos_max_two
  BEFORE INSERT OR UPDATE OF is_active, professional_id ON public.portfolio_videos
  FOR EACH ROW EXECUTE FUNCTION public.tg_portfolio_video_max_two();

-- When a pro adds/removes videography services, sync is_active for their videos
CREATE OR REPLACE FUNCTION public.tg_sync_portfolio_video_eligibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pid uuid;
  eligible boolean;
BEGIN
  pid := COALESCE(NEW.professional_id, OLD.professional_id);
  SELECT EXISTS (
    SELECT 1 FROM public.professional_services ps
    JOIN public.services s ON s.id = ps.service_id
    WHERE ps.professional_id = pid AND s.kind = 'videography'
  ) INTO eligible;

  IF eligible THEN
    -- Re-activate up to 2 most recent inactive videos
    UPDATE public.portfolio_videos pv
    SET is_active = true
    WHERE pv.id IN (
      SELECT id FROM public.portfolio_videos
      WHERE professional_id = pid AND status = 'ready' AND is_active = false
      ORDER BY created_at DESC
      LIMIT 2
    );
  ELSE
    UPDATE public.portfolio_videos
    SET is_active = false
    WHERE professional_id = pid AND is_active = true;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_portfolio_video_eligibility_ins ON public.professional_services;
CREATE TRIGGER sync_portfolio_video_eligibility_ins
  AFTER INSERT ON public.professional_services
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_portfolio_video_eligibility();

DROP TRIGGER IF EXISTS sync_portfolio_video_eligibility_del ON public.professional_services;
CREATE TRIGGER sync_portfolio_video_eligibility_del
  AFTER DELETE ON public.professional_services
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_portfolio_video_eligibility();

-- ----------------------------------------------------------
-- portfolio_video_reports
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portfolio_video_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.portfolio_videos(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason public.portfolio_video_report_reason NOT NULL,
  note text,
  status public.portfolio_video_report_status NOT NULL DEFAULT 'open',
  country text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (video_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_pvr_video ON public.portfolio_video_reports(video_id);
CREATE INDEX IF NOT EXISTS idx_pvr_status ON public.portfolio_video_reports(status);
CREATE INDEX IF NOT EXISTS idx_pvr_country ON public.portfolio_video_reports(country);

GRANT SELECT, INSERT ON public.portfolio_video_reports TO authenticated;
GRANT ALL ON public.portfolio_video_reports TO service_role;

ALTER TABLE public.portfolio_video_reports ENABLE ROW LEVEL SECURITY;

-- Signed-in users can submit ONE report per video
CREATE POLICY "Users insert own report" ON public.portfolio_video_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Reporter can read their own report; staff can read in their country
CREATE POLICY "Reporter or staff read" ON public.portfolio_video_reports
  FOR SELECT
  TO authenticated
  USING (
    reporter_id = auth.uid()
    OR public.staff_can_see_country(auth.uid(), country)
  );

-- Staff can update/resolve within scope
CREATE POLICY "Staff resolve reports" ON public.portfolio_video_reports
  FOR UPDATE
  TO authenticated
  USING (public.staff_can_see_country(auth.uid(), country))
  WITH CHECK (public.staff_can_see_country(auth.uid(), country));

-- Auto-stamp country and bump report_count
CREATE OR REPLACE FUNCTION public.tg_pvr_stamp_and_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL THEN
    SELECT country INTO NEW.country FROM public.portfolio_videos WHERE id = NEW.video_id;
    IF NEW.country IS NULL THEN NEW.country := 'United Kingdom'; END IF;
  END IF;
  UPDATE public.portfolio_videos
  SET report_count = report_count + 1
  WHERE id = NEW.video_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pvr_stamp_and_count ON public.portfolio_video_reports;
CREATE TRIGGER pvr_stamp_and_count
  BEFORE INSERT ON public.portfolio_video_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_pvr_stamp_and_count();

-- ----------------------------------------------------------
-- Feature flag (in platform_settings)
-- ----------------------------------------------------------
INSERT INTO public.platform_settings (key, value)
VALUES ('portfolio_videos_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
