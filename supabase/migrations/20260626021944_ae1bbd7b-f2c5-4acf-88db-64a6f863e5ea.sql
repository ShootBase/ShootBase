
CREATE TABLE public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  related_ticket_id UUID,
  related_report_id UUID,
  related_lead_id UUID,
  related_job_id UUID,
  source_user_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_notifications_created_at_idx ON public.admin_notifications (created_at DESC);
CREATE INDEX admin_notifications_unread_idx ON public.admin_notifications (read_at) WHERE read_at IS NULL;

GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Any active staff member can view all admin notifications
CREATE POLICY "Staff can view admin notifications"
  ON public.admin_notifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_accounts s
      WHERE s.user_id = auth.uid() AND s.status = 'active'
    )
  );

-- Any active staff member can mark as read (only read_at field matters)
CREATE POLICY "Staff can update admin notifications"
  ON public.admin_notifications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_accounts s
      WHERE s.user_id = auth.uid() AND s.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_accounts s
      WHERE s.user_id = auth.uid() AND s.status = 'active'
    )
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
