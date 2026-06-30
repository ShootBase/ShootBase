
ALTER TABLE public.admin_notes
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS admin_notes_public_ticket_idx
  ON public.admin_notes (support_request_id, created_at DESC)
  WHERE is_public = true;

CREATE POLICY "ticket owner reads public replies"
ON public.admin_notes FOR SELECT
TO authenticated
USING (
  is_public = true
  AND EXISTS (
    SELECT 1 FROM public.support_requests sr
    WHERE sr.id = admin_notes.support_request_id
      AND sr.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.tg_admin_notes_touch_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_requests
  SET updated_at = now()
  WHERE id = NEW.support_request_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_admin_notes_touch_ticket ON public.admin_notes;
CREATE TRIGGER tg_admin_notes_touch_ticket
AFTER INSERT ON public.admin_notes
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_notes_touch_ticket();
