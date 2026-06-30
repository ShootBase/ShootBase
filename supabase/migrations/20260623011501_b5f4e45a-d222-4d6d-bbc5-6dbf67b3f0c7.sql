alter table public.staff_invites
  add column if not exists email_status text not null default 'pending',
  add column if not exists email_last_error text,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_attempts integer not null default 0;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_invites_email_status_check'
  ) then
    alter table public.staff_invites
      add constraint staff_invites_email_status_check
      check (email_status in ('pending','sent','failed'));
  end if;
end $$;