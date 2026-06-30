
CREATE POLICY "jobs matched pros read"
ON public.jobs
FOR SELECT
TO authenticated
USING (
  status = 'open'
  AND EXISTS (
    SELECT 1
    FROM public.lead_matches lm
    JOIN public.professionals p ON p.id = lm.professional_id
    WHERE lm.job_id = jobs.id
      AND p.user_id = auth.uid()
  )
);
