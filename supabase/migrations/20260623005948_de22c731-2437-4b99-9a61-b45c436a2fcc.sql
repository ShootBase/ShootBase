
-- 1) Fix support_requests RLS to use the canonical staff RBAC
-- (replace legacy user_roles "has_role(..., 'admin')" checks with has_staff_permission)

DROP POLICY IF EXISTS "Admins can read all support requests" ON public.support_requests;
DROP POLICY IF EXISTS "Admins can update support requests" ON public.support_requests;

CREATE POLICY "Staff can read support tickets"
  ON public.support_requests
  FOR SELECT
  TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'tickets.view'::public.staff_permission));

CREATE POLICY "Staff can update support tickets"
  ON public.support_requests
  FOR UPDATE
  TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'tickets.manage'::public.staff_permission))
  WITH CHECK (public.has_staff_permission(auth.uid(), 'tickets.manage'::public.staff_permission));

-- 2) Realtime: stream new tickets + replies into the admin inbox
ALTER TABLE public.support_requests REPLICA IDENTITY FULL;
ALTER TABLE public.admin_notes      REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='support_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.support_requests';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='admin_notes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notes';
  END IF;
END $$;
