
-- 1. Expand status set + add admin message / review fields
ALTER TABLE public.bank_transfer_requests
  DROP CONSTRAINT IF EXISTS bank_transfer_requests_status_check;
ALTER TABLE public.bank_transfer_requests
  ADD CONSTRAINT bank_transfer_requests_status_check
  CHECK (status IN ('pending','approved','rejected','more_info_requested'));

ALTER TABLE public.bank_transfer_requests
  ADD COLUMN IF NOT EXISTS admin_message text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS credits_granted int;

-- 2. Storage policies for private receipts bucket
-- Pros upload into their own user-id folder; pros read own; admins read all.
DROP POLICY IF EXISTS "bt receipts pro upload own" ON storage.objects;
CREATE POLICY "bt receipts pro upload own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bank-transfer-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "bt receipts pro read own" ON storage.objects;
CREATE POLICY "bt receipts pro read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'bank-transfer-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "bt receipts admin read all" ON storage.objects;
CREATE POLICY "bt receipts admin read all"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'bank-transfer-receipts'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
