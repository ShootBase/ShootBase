
-- Add status column for country lifecycle: live | preview | disabled
ALTER TABLE public.platform_countries
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('live','preview','disabled'));

-- Backfill from existing flags
UPDATE public.platform_countries
SET status = CASE
  WHEN active = true AND COALESCE(launch_status,'') = 'live' THEN 'live'
  WHEN code = 'NG' THEN 'preview'
  ELSE 'disabled'
END;

-- Ensure NG starts in preview, GB live
UPDATE public.platform_countries SET status='live', active=true WHERE code='GB';
UPDATE public.platform_countries SET status='preview' WHERE code='NG';

-- Helper: is the given user a super admin?
CREATE OR REPLACE FUNCTION public.is_super_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_accounts
    WHERE user_id = _uid AND status = 'active' AND role = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO anon, authenticated;
