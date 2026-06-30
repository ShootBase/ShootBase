
-- Track lead views (mark-as-read) for pros
CREATE TABLE public.pro_lead_views (
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (professional_id, job_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_lead_views TO authenticated;
GRANT ALL ON public.pro_lead_views TO service_role;
ALTER TABLE public.pro_lead_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pros manage own lead views" ON public.pro_lead_views
  FOR ALL TO authenticated
  USING (professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid()))
  WITH CHECK (professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid()));

-- Pro favourited leads (star)
CREATE TABLE public.pro_lead_favourites (
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (professional_id, job_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_lead_favourites TO authenticated;
GRANT ALL ON public.pro_lead_favourites TO service_role;
ALTER TABLE public.pro_lead_favourites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pros manage own lead favourites" ON public.pro_lead_favourites
  FOR ALL TO authenticated
  USING (professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid()))
  WITH CHECK (professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid()));

-- Saved filter views
CREATE TABLE public.pro_saved_lead_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_saved_lead_views TO authenticated;
GRANT ALL ON public.pro_saved_lead_views TO service_role;
ALTER TABLE public.pro_saved_lead_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pros manage own saved views" ON public.pro_saved_lead_views
  FOR ALL TO authenticated
  USING (professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid()))
  WITH CHECK (professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_pro_saved_lead_views() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_touch_pro_saved_lead_views BEFORE UPDATE ON public.pro_saved_lead_views
  FOR EACH ROW EXECUTE FUNCTION public.touch_pro_saved_lead_views();
