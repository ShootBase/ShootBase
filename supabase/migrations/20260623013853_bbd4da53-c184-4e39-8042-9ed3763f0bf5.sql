
REVOKE ALL ON public.lead_notification_debug FROM anon, authenticated, public;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname='message_email_debug' AND schemaname='public') THEN
    EXECUTE 'REVOKE ALL ON public.message_email_debug FROM anon, authenticated, public';
  END IF;
END $$;
