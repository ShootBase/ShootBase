ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS duration_days int,
  ADD COLUMN IF NOT EXISTS duration_start_date date,
  ADD COLUMN IF NOT EXISTS duration_end_date date,
  ADD COLUMN IF NOT EXISTS duration_consecutive boolean,
  ADD COLUMN IF NOT EXISTS duration_flexible boolean;