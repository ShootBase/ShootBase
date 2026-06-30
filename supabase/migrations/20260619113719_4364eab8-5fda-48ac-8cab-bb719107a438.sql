
CREATE POLICY "Customers can upload to their own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'job-inspiration' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Customers can read their own inspiration files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'job-inspiration' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Customers can delete their own inspiration files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'job-inspiration' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Pros who unlocked a job can read its inspiration files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-inspiration'
  AND EXISTS (
    SELECT 1 FROM public.job_attachments ja
    JOIN public.lead_unlocks lu ON lu.job_id = ja.job_id
    JOIN public.professionals pr ON pr.id = lu.professional_id
    WHERE ja.storage_path = storage.objects.name
      AND pr.user_id = auth.uid()
  )
);
