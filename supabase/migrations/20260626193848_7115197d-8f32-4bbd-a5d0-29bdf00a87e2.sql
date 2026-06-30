alter table public.admin_notes
  add column if not exists email_sent boolean not null default false,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_status text,
  add column if not exists email_error text,
  add column if not exists email_provider_message_id text,
  add column if not exists email_log_id text;

create index if not exists idx_admin_notes_email_log_id
  on public.admin_notes (email_log_id)
  where email_log_id is not null;