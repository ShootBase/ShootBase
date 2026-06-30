CREATE TABLE IF NOT EXISTS public.bank_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  country_code text NOT NULL DEFAULT 'NG',
  package_id text NOT NULL,
  credits int NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  bank_name text NOT NULL,
  transfer_reference text NOT NULL,
  sender_account_name text NOT NULL,
  payment_date date NOT NULL,
  receipt_path text,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.bank_transfer_requests TO authenticated;
GRANT ALL ON public.bank_transfer_requests TO service_role;

ALTER TABLE public.bank_transfer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pros read own bank transfers"
  ON public.bank_transfer_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "pros insert own bank transfers"
  ON public.bank_transfer_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admins read all bank transfers"
  ON public.bank_transfer_requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update bank transfers"
  ON public.bank_transfer_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS bank_transfer_requests_status_idx
  ON public.bank_transfer_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS bank_transfer_requests_pro_idx
  ON public.bank_transfer_requests(professional_id, created_at DESC);