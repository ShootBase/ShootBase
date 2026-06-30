ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_duration_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_duration_check CHECK (
  duration IS NULL OR duration = ANY (ARRAY['1h','2h','3h','4h','5h','6h','7h','8h','1-2h','half-day','full-day','multi-day'])
);