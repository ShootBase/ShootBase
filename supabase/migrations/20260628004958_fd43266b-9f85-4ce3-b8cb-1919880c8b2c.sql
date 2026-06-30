
-- Add cover storage path for upload-based cover images
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS cover_storage_path text;

-- RLS for professional-covers bucket (owner-scoped)
CREATE POLICY "pro_covers_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'professional-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "pro_covers_owner_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'professional-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "pro_covers_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'professional-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "pro_covers_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'professional-covers' AND (storage.foldername(name))[1] = auth.uid()::text);
