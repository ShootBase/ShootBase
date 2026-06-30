
-- 1. Column-level revokes (hide PII from Data API)
REVOKE SELECT (contact_name, postcode) ON public.professionals FROM anon, authenticated;
REVOKE SELECT (contact_name, postcode) ON public.professionals FROM PUBLIC;

REVOKE SELECT (contact_name, contact_phone) ON public.jobs FROM anon, authenticated;
REVOKE SELECT (contact_name, contact_phone) ON public.jobs FROM PUBLIC;

-- 2. Public read of visible reviews
DROP POLICY IF EXISTS "reviews public read visible" ON public.reviews;
CREATE POLICY "reviews public read visible"
  ON public.reviews
  FOR SELECT
  TO anon, authenticated
  USING (status = 'visible');

-- 3. Helper to rotate the cron secret used by scheduled hook calls.
-- Reschedules the existing cron jobs to send an "x-cron-secret" header
-- containing the provided value. SECURITY DEFINER so it can touch pg_cron.
CREATE OR REPLACE FUNCTION public.admin_set_cron_hooks_secret(_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  r RECORD;
  hdrs jsonb;
  body jsonb;
  new_cmd text;
BEGIN
  IF _secret IS NULL OR length(_secret) < 16 THEN
    RAISE EXCEPTION 'Secret too short';
  END IF;

  FOR r IN
    SELECT jobid, jobname, schedule, command
    FROM cron.job
    WHERE command ILIKE '%/api/public/hooks/lead-notifications-dispatch%'
       OR command ILIKE '%/api/public/hooks/lead-digest%'
       OR command ILIKE '%/api/public/hooks/sla-check%'
  LOOP
    -- pick body based on existing schedule/jobname
    IF r.jobname = 'lead-digest-daily' THEN
      body := '{"mode":"daily"}'::jsonb;
    ELSIF r.jobname = 'lead-digest-weekly' THEN
      body := '{"mode":"weekly"}'::jsonb;
    ELSE
      body := '{}'::jsonb;
    END IF;

    hdrs := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _secret
    );

    new_cmd := format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := %L::jsonb
      );$cmd$,
      (regexp_match(r.command, 'url\s*:=\s*''([^'']+)'''))[1],
      hdrs::text,
      body::text
    );

    PERFORM cron.unschedule(r.jobid);
    PERFORM cron.schedule(r.jobname, r.schedule, new_cmd);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_cron_hooks_secret(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_cron_hooks_secret(text) TO sandbox_exec, service_role;
