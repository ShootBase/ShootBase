-- 1. Public read for professional avatar images (bucket stays private, only avatars are public)
DROP POLICY IF EXISTS "pro avatars public read" ON storage.objects;
CREATE POLICY "pro avatars public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'professional-avatars');

-- 2. Stop anonymous (unauthenticated) visitors from reading sensitive professional columns
REVOKE SELECT (contact_name, postcode) ON public.professionals FROM anon;