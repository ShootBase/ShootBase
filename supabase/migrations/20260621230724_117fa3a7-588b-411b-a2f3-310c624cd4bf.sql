
CREATE TABLE public.pro_lead_dismissals (
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (professional_id, job_id)
);

GRANT SELECT, INSERT, DELETE ON public.pro_lead_dismissals TO authenticated;
GRANT ALL ON public.pro_lead_dismissals TO service_role;

ALTER TABLE public.pro_lead_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pros manage their own dismissals"
ON public.pro_lead_dismissals
FOR ALL
TO authenticated
USING (
  professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
)
WITH CHECK (
  professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
);

CREATE INDEX idx_pro_lead_dismissals_pro ON public.pro_lead_dismissals(professional_id);
