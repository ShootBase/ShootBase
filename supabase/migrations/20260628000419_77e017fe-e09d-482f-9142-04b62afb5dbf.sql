-- 1. Banned emails table
CREATE TABLE IF NOT EXISTS public.banned_emails (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  banned_by UUID NULL,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  country TEXT NULL
);

GRANT SELECT ON public.banned_emails TO authenticated;
GRANT ALL ON public.banned_emails TO service_role;

ALTER TABLE public.banned_emails ENABLE ROW LEVEL SECURITY;

-- Only staff with staff.manage or users.delete may see the full table.
CREATE POLICY "Staff can read banned emails"
  ON public.banned_emails FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- 2. Public-callable banned-email check (case-insensitive). Returns bool.
CREATE OR REPLACE FUNCTION public.is_email_banned(_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.banned_emails
    WHERE email = lower(trim(_email))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_email_banned(TEXT) TO anon, authenticated, service_role;

-- 3. Staff country helper used by admin RPCs to enforce scope.
CREATE OR REPLACE FUNCTION public.staff_country_of(_uid UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT country FROM public.staff_accounts
   WHERE user_id = _uid AND status = 'active'
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.staff_country_of(UUID) TO authenticated, service_role;