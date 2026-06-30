
-- Extend platform_countries with configuration columns
ALTER TABLE public.platform_countries
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS currency_symbol text,
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS phone_code text,
  ADD COLUMN IF NOT EXISTS support_email text,
  ADD COLUMN IF NOT EXISTS launch_status text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Seed/update UK and Nigeria configuration
UPDATE public.platform_countries SET
  name = 'United Kingdom',
  domain = 'shootbase.co.uk',
  active = true,
  currency = 'GBP',
  currency_symbol = '£',
  payment_provider = 'stripe',
  phone_code = '+44',
  support_email = 'support@shootbase.co.uk',
  launch_status = 'live'
WHERE code = 'GB';

UPDATE public.platform_countries SET
  name = 'Nigeria',
  domain = 'shootbase.ng',
  active = false,
  currency = 'NGN',
  currency_symbol = '₦',
  payment_provider = 'paystack',
  phone_code = '+234',
  support_email = 'support@shootbase.co.uk',
  launch_status = 'coming_soon'
WHERE code = 'NG';

INSERT INTO public.platform_countries (code, name, domain, active, currency, currency_symbol, payment_provider, phone_code, support_email, launch_status)
VALUES
  ('GB','United Kingdom','shootbase.co.uk', true, 'GBP','£','stripe','+44','support@shootbase.co.uk','live'),
  ('NG','Nigeria','shootbase.ng', false, 'NGN','₦','paystack','+234','support@shootbase.co.uk','coming_soon')
ON CONFLICT (code) DO NOTHING;

-- Coming-soon email signups
CREATE TABLE IF NOT EXISTS public.coming_soon_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  country_code text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS coming_soon_signups_email_country_uniq
  ON public.coming_soon_signups (lower(email), country_code);

GRANT SELECT, INSERT ON public.coming_soon_signups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coming_soon_signups TO authenticated;
GRANT ALL ON public.coming_soon_signups TO service_role;

ALTER TABLE public.coming_soon_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coming_soon insert anyone" ON public.coming_soon_signups;
CREATE POLICY "coming_soon insert anyone"
  ON public.coming_soon_signups FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "coming_soon admin read" ON public.coming_soon_signups;
CREATE POLICY "coming_soon admin read"
  ON public.coming_soon_signups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_accounts s
      WHERE s.user_id = auth.uid() AND s.status = 'active'
    )
  );

DROP POLICY IF EXISTS "coming_soon admin delete" ON public.coming_soon_signups;
CREATE POLICY "coming_soon admin delete"
  ON public.coming_soon_signups FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_accounts s
      WHERE s.user_id = auth.uid() AND s.role = 'super_admin' AND s.status = 'active'
    )
  );

-- Allow super_admin to update platform_countries (toggle enabled/launch status)
DROP POLICY IF EXISTS "platform_countries super admin write" ON public.platform_countries;
CREATE POLICY "platform_countries super admin write"
  ON public.platform_countries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_accounts s
      WHERE s.user_id = auth.uid() AND s.role = 'super_admin' AND s.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_accounts s
      WHERE s.user_id = auth.uid() AND s.role = 'super_admin' AND s.status = 'active'
    )
  );

GRANT SELECT ON public.platform_countries TO anon, authenticated;
GRANT UPDATE ON public.platform_countries TO authenticated;
GRANT ALL ON public.platform_countries TO service_role;
