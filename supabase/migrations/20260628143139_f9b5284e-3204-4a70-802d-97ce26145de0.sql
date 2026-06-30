
-- Fix: SUPA_rls_policy_always_true + coming_soon_signups_staff_read
DROP POLICY IF EXISTS "coming_soon insert anyone" ON public.coming_soon_signups;
CREATE POLICY "coming_soon insert anyone"
ON public.coming_soon_signups
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email IS NOT NULL
  AND length(email) <= 254
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND (country_code IS NULL OR length(country_code) <= 8)
);

DROP POLICY IF EXISTS "coming_soon admin read" ON public.coming_soon_signups;
CREATE POLICY "coming_soon admin read"
ON public.coming_soon_signups
FOR SELECT
TO authenticated
USING (
  public.has_staff_permission(auth.uid(), 'settings.manage'::staff_permission)
);

-- Fix: jobs_contact_phone_name_exposure
-- Revoke column-level SELECT on PII fields. Pros must fetch via SECURITY DEFINER RPC.
REVOKE SELECT (contact_phone, contact_name) ON public.jobs FROM anon, authenticated;
