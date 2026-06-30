ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS admin_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_viewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_requests_admin_viewed_at_idx
  ON public.support_requests(admin_viewed_at);