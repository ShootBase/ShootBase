
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS avatar_kind text;

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_avatar_kind_check;
ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_avatar_kind_check
  CHECK (avatar_kind IS NULL OR avatar_kind IN ('logo','photo'));

-- Storage policies: professional-avatars bucket, scoped to <auth.uid()>/...
DROP POLICY IF EXISTS "pro avatars insert own" ON storage.objects;
DROP POLICY IF EXISTS "pro avatars update own" ON storage.objects;
DROP POLICY IF EXISTS "pro avatars delete own" ON storage.objects;
DROP POLICY IF EXISTS "pro avatars read own" ON storage.objects;

CREATE POLICY "pro avatars insert own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'professional-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "pro avatars update own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'professional-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "pro avatars delete own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'professional-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "pro avatars read own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'professional-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
