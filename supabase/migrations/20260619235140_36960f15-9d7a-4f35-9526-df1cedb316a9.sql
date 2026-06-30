
-- 1) jobs_contact_details_pro_read: require unlock for matched-pro row access
DROP POLICY IF EXISTS "jobs matched pro read" ON public.jobs;
CREATE POLICY "jobs unlocked pro read"
ON public.jobs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.lead_unlocks lu
    JOIN public.professionals p ON p.id = lu.professional_id
    WHERE lu.job_id = jobs.id AND p.user_id = auth.uid()
  )
);

-- 2) profiles_no_admin_or_cross_read: allow conversation participants to read each other's profile
CREATE POLICY "profiles shared thread read"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quote_requests qr
    LEFT JOIN public.professionals pr ON pr.id = qr.professional_id
    WHERE (qr.customer_id = profiles.id OR pr.user_id = profiles.id)
      AND (qr.customer_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.professionals pr2
        WHERE pr2.id = qr.professional_id AND pr2.user_id = auth.uid()
      ))
  )
);

-- 3) realtime_messages_no_rls: lock Broadcast/Presence channels (app uses postgres_changes only,
--    which is governed by source-table RLS, not realtime.messages).
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny realtime broadcast by default" ON realtime.messages;
CREATE POLICY "deny realtime broadcast by default"
ON realtime.messages
FOR SELECT
TO authenticated
USING (false);

-- 4) SECURITY DEFINER executable: revoke from PUBLIC/anon; grant only to authenticated where intended
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unlock_job(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_thread_read(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_thread_for_me(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.browse_marketplace_leads() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_pro_threads() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_unlocked_leads() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_thread_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_thread_for_me(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.browse_marketplace_leads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_pro_threads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_unlocked_leads() TO authenticated;
