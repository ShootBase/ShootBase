
-- 1. Add configurable lead expiry duration
ALTER TABLE public.credit_settings 
  ADD COLUMN IF NOT EXISTS lead_expiry_days INTEGER NOT NULL DEFAULT 7;

UPDATE public.credit_settings SET lead_expiry_days = 7 WHERE id = 1;

-- 2. Trigger to use configured expiry duration on new jobs (overrides static 7d default)
CREATE OR REPLACE FUNCTION public.tg_set_job_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE _days INTEGER;
BEGIN
  IF NEW.expires_at IS NULL OR NEW.expires_at = (now() + interval '7 days') THEN
    SELECT lead_expiry_days INTO _days FROM public.credit_settings WHERE id = 1;
    NEW.expires_at := now() + (COALESCE(_days, 7) || ' days')::interval;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS set_job_expiry ON public.jobs;
CREATE TRIGGER set_job_expiry BEFORE INSERT ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.tg_set_job_expiry();

-- 3. Allow admins to read and update credit_settings
DROP POLICY IF EXISTS "Admins can update credit settings" ON public.credit_settings;
CREATE POLICY "Admins can update credit settings"
  ON public.credit_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
