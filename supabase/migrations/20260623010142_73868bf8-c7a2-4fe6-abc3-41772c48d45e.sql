
ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS support_requests_assigned_to_idx
  ON public.support_requests (assigned_to);

-- Allow staff to read tickets assigned to them even without tickets.view permission,
-- so future "assigned only" staff still see their work.
DROP POLICY IF EXISTS "Assignees can view their tickets" ON public.support_requests;
CREATE POLICY "Assignees can view their tickets"
  ON public.support_requests
  FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid());

DROP POLICY IF EXISTS "Assignees can update their tickets" ON public.support_requests;
CREATE POLICY "Assignees can update their tickets"
  ON public.support_requests
  FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());
