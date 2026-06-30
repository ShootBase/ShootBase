
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS flexible_dates BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration TEXT,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact TEXT,
  ADD COLUMN IF NOT EXISTS inspiration_links TEXT[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE public.jobs ADD CONSTRAINT jobs_duration_check
    CHECK (duration IS NULL OR duration IN ('1-2h','half-day','full-day','multi-day'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.jobs ADD CONSTRAINT jobs_preferred_contact_check
    CHECK (preferred_contact IS NULL OR preferred_contact IN ('email','phone','either'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.job_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_attachments_job_id_idx ON public.job_attachments(job_id);

GRANT SELECT, INSERT, DELETE ON public.job_attachments TO authenticated;
GRANT ALL ON public.job_attachments TO service_role;

ALTER TABLE public.job_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers manage their own job attachments"
ON public.job_attachments
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_attachments.job_id AND j.customer_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_attachments.job_id AND j.customer_id = auth.uid()));

CREATE POLICY "Pros who unlocked the lead can view attachments"
ON public.job_attachments
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.lead_unlocks lu
  JOIN public.professionals pr ON pr.id = lu.professional_id
  WHERE lu.job_id = job_attachments.job_id AND pr.user_id = auth.uid()
));
