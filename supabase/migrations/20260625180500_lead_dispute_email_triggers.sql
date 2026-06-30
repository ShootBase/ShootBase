-- Redundant database-side email enqueue for lead-dispute lifecycle events.
-- Server functions still create the business records/notifications, but this
-- trigger guarantees every successful insert and pending -> approved/rejected
-- status transition gets an email queue entry even if application code changes.

CREATE OR REPLACE FUNCTION public.enqueue_lead_dispute_email_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _kind text;
  _template text;
  _message_id text;
  _pro record;
  _email text;
  _job_title text;
  _professional_name text;
  _metadata jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _kind := 'submitted';
    _template := 'lead-dispute-submitted';
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'approved' THEN
    _kind := 'approve';
    _template := 'lead-dispute-approved';
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'rejected' THEN
    _kind := 'reject';
    _template := 'lead-dispute-rejected';
  ELSE
    RETURN NEW;
  END IF;

  _message_id := 'lead-dispute-' || _kind || '-' || NEW.id::text;

  IF EXISTS (
    SELECT 1 FROM public.email_send_log
    WHERE message_id = _message_id AND status IN ('pending','sent')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id, p.business_name
    INTO _pro
    FROM public.professionals p
   WHERE p.id = NEW.professional_id;

  IF _pro.user_id IS NULL THEN
    INSERT INTO public.lead_report_events (report_id, action, metadata)
    VALUES (NEW.id, 'email_notification_failed', jsonb_build_object('kind', _kind, 'error', 'pro_not_found', 'delivery_status', 'failed'));
    RETURN NEW;
  END IF;

  SELECT email::text INTO _email FROM auth.users WHERE id = _pro.user_id;
  SELECT title INTO _job_title FROM public.jobs WHERE id = NEW.job_id;
  _professional_name := COALESCE(NULLIF(_pro.business_name, ''), 'there');

  IF _email IS NULL THEN
    INSERT INTO public.lead_report_events (report_id, action, metadata)
    VALUES (NEW.id, 'email_notification_failed', jsonb_build_object('kind', _kind, 'error', 'no_email', 'delivery_status', 'failed'));
    RETURN NEW;
  END IF;

  _metadata := jsonb_build_object('report_id', NEW.id, 'job_id', NEW.job_id, 'kind', _kind, 'source', 'db_trigger');

  INSERT INTO public.email_send_log (message_id, template_name, recipient_email, status, metadata)
  VALUES (_message_id, _template, _email, 'pending', _metadata);

  PERFORM public.enqueue_email(
    'transactional_emails',
    jsonb_build_object(
      'template_name', _template,
      'recipient_email', _email,
      'idempotency_key', _message_id,
      'from', 'Shootbase <noreply@shootbase.co.uk>',
      'reply_to', 'noreply@shootbase.co.uk',
      'sender_domain', 'shootbase.co.uk',
      'metadata', _metadata,
      'template_data', CASE _kind
        WHEN 'submitted' THEN jsonb_build_object(
          'professionalName', _professional_name,
          'leadId', NEW.job_id,
          'reportId', NEW.id,
          'reason', NEW.reason,
          'submittedAt', to_char(NEW.created_at AT TIME ZONE 'Europe/London', 'DD/MM/YYYY HH24:MI')
        )
        WHEN 'approve' THEN jsonb_build_object(
          'professionalName', _professional_name,
          'leadId', NEW.job_id,
          'reportId', NEW.id,
          'credits', COALESCE(NEW.credits_refunded_amount, 0),
          'dashboardUrl', 'https://www.shootbase.co.uk/pro/dashboard'
        )
        ELSE jsonb_build_object(
          'professionalName', _professional_name,
          'leadId', NEW.job_id,
          'reportId', NEW.id,
          'adminNotes', NEW.resolution_note,
          'supportUrl', 'https://www.shootbase.co.uk/help'
        )
      END
    )
  );

  INSERT INTO public.lead_report_events (report_id, action, metadata)
  VALUES (NEW.id, 'email_notification_sent', _metadata || jsonb_build_object(
    'message_id', _message_id,
    'template', _template,
    'recipient_email', _email,
    'delivery_status', 'pending',
    'queued_at', now()
  ));

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.lead_report_events (report_id, action, metadata)
  VALUES (NEW.id, 'email_notification_failed', jsonb_build_object('kind', COALESCE(_kind, 'unknown'), 'error', SQLERRM, 'delivery_status', 'failed'));
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS tg_lead_reports_email_insert ON public.lead_reports;
CREATE TRIGGER tg_lead_reports_email_insert
AFTER INSERT ON public.lead_reports
FOR EACH ROW EXECUTE FUNCTION public.enqueue_lead_dispute_email_event();

DROP TRIGGER IF EXISTS tg_lead_reports_email_status ON public.lead_reports;
CREATE TRIGGER tg_lead_reports_email_status
AFTER UPDATE OF status ON public.lead_reports
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.enqueue_lead_dispute_email_event();
