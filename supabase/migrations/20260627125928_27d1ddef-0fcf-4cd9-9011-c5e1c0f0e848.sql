-- Repoint the process-email-queue cron from the (currently unpublished) production
-- URL to the stable preview URL so queued emails drain. After the project is published,
-- this can be repointed back to project--<id>.lovable.app.
SELECT cron.unschedule('process-email-queue');

SELECT cron.schedule(
  'process-email-queue',
  '5 seconds',
  $cron$
  SELECT CASE
    WHEN (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now()
      THEN NULL
    WHEN EXISTS (SELECT 1 FROM pgmq.q_auth_emails LIMIT 1)
      OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails LIMIT 1)
      THEN net.http_post(
        url := 'https://project--0b05c4cf-892b-4ae5-8702-a8c1c21e62fa-dev.lovable.app/lovable/email/queue/process',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Lovable-Context', 'cron',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'email_queue_service_role_key'
          )
        ),
        body := '{}'::jsonb
      )
    ELSE NULL
  END;
  $cron$
);