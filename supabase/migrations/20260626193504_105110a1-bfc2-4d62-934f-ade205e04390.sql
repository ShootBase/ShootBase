ALTER TABLE public.admin_notes
  ADD COLUMN IF NOT EXISTS email_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS email_provider_message_id text,
  ADD COLUMN IF NOT EXISTS email_log_id uuid;

CREATE INDEX IF NOT EXISTS admin_notes_email_status_idx
  ON public.admin_notes (email_status)
  WHERE is_public = true;