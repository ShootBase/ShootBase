
SELECT cron.unschedule('lead-notifications-dispatch');
SELECT cron.unschedule('lead-digest-daily');
SELECT cron.unschedule('lead-digest-weekly');

SELECT cron.schedule(
  'lead-notifications-dispatch',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.shootbase.co.uk/api/public/hooks/lead-notifications-dispatch',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwaXphd3ZvaGxqZmJjZGpzZ3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MTM5NDMsImV4cCI6MjA5NzM4OTk0M30.2ujZC-yHg29HSPgcCFKjWAJUTjsIBIy_gewrYUVMNDI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'lead-digest-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.shootbase.co.uk/api/public/hooks/lead-digest',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwaXphd3ZvaGxqZmJjZGpzZ3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MTM5NDMsImV4cCI6MjA5NzM4OTk0M30.2ujZC-yHg29HSPgcCFKjWAJUTjsIBIy_gewrYUVMNDI"}'::jsonb,
    body := '{"mode":"daily"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'lead-digest-weekly',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://www.shootbase.co.uk/api/public/hooks/lead-digest',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwaXphd3ZvaGxqZmJjZGpzZ3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MTM5NDMsImV4cCI6MjA5NzM4OTk0M30.2ujZC-yHg29HSPgcCFKjWAJUTjsIBIy_gewrYUVMNDI"}'::jsonb,
    body := '{"mode":"weekly"}'::jsonb
  );
  $$
);
