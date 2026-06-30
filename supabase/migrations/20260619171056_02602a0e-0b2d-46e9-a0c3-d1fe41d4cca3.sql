
CREATE TYPE public.onboarding_video_kind AS ENUM ('youtube', 'vimeo', 'mp4', 'url');

CREATE TABLE public.onboarding_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'How to Build a Profile That Wins More Clients',
  subtitle TEXT NOT NULL DEFAULT 'Learn how to optimise your ShootBase profile to increase visibility, build trust, and receive more enquiries.',
  kind public.onboarding_video_kind NOT NULL DEFAULT 'youtube',
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_label TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.onboarding_videos TO authenticated;
GRANT ALL ON public.onboarding_videos TO service_role;

ALTER TABLE public.onboarding_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read enabled videos"
  ON public.onboarding_videos FOR SELECT
  TO authenticated
  USING (enabled = TRUE OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage videos"
  ON public.onboarding_videos FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tg_onboarding_videos_updated_at
  BEFORE UPDATE ON public.onboarding_videos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
