
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS brand_color text,
  ADD COLUMN IF NOT EXISTS logo_storage_path text;

-- Storage RLS: business-logos bucket. Only the owning user (folder name = auth.uid()) can write/delete.
DO $$ BEGIN
  CREATE POLICY "business_logos_owner_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'business-logos'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "business_logos_owner_update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'business-logos'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "business_logos_owner_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'business-logos'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "business_logos_owner_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'business-logos'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
