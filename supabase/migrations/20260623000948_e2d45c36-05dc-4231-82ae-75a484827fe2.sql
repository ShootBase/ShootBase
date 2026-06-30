
CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read platform settings"
ON public.platform_settings FOR SELECT
TO authenticated
USING (public.has_staff_permission(auth.uid(), 'settings.manage'));

CREATE OR REPLACE FUNCTION public.platform_settings_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_settings_updated_at
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW EXECUTE FUNCTION public.platform_settings_touch_updated_at();

INSERT INTO public.platform_settings (key, value)
VALUES ('support_email', to_jsonb('info@shootbase.co.uk'::text))
ON CONFLICT (key) DO NOTHING;
