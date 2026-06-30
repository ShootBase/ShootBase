
ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS client_status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS deleted_by_customer BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_by_pro BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.tg_set_contacted_on_pro_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pro_user UUID; _qr RECORD;
BEGIN
  SELECT qr.* INTO _qr FROM public.quote_requests qr WHERE qr.id = NEW.quote_request_id;
  IF _qr IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO _pro_user FROM public.professionals WHERE id = _qr.professional_id;
  IF NEW.sender_id = _pro_user AND _qr.client_status = 'new' THEN
    UPDATE public.quote_requests SET client_status = 'contacted' WHERE id = _qr.id AND client_status = 'new';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_messages_set_contacted ON public.messages;
CREATE TRIGGER tg_messages_set_contacted AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_contacted_on_pro_message();

CREATE OR REPLACE FUNCTION public.tg_close_threads_on_job_close()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('closed','expired'))
     OR (TG_OP = 'DELETE') THEN
    UPDATE public.quote_requests
      SET client_status = 'closed', closed = TRUE, status = 'cancelled'
      WHERE job_id = COALESCE(NEW.id, OLD.id) AND client_status <> 'closed';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_jobs_close_threads ON public.jobs;
CREATE TRIGGER tg_jobs_close_threads AFTER UPDATE OR DELETE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_close_threads_on_job_close();

CREATE OR REPLACE FUNCTION public.delete_thread_for_me(_qr_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _qr RECORD; _pro_user UUID;
BEGIN
  SELECT * INTO _qr FROM public.quote_requests WHERE id = _qr_id;
  IF _qr IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  SELECT user_id INTO _pro_user FROM public.professionals WHERE id = _qr.professional_id;
  IF auth.uid() = _qr.customer_id THEN
    UPDATE public.quote_requests SET deleted_by_customer = TRUE WHERE id = _qr_id;
  ELSIF auth.uid() = _pro_user THEN
    UPDATE public.quote_requests SET deleted_by_pro = TRUE WHERE id = _qr_id;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.my_pro_threads();
CREATE FUNCTION public.my_pro_threads()
RETURNS TABLE(qr_id uuid, job_id uuid, title text, city text, event_date date, event_time time without time zone, budget_band text, details text, customer_id uuid, customer_name text, customer_email text, customer_phone text, last_message_at timestamp with time zone, last_message_body text, last_message_sender uuid, last_message_source text, unread_count integer, status text, client_status text, archived_by_pro boolean, hired boolean, closed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH pro AS (SELECT id, user_id FROM professionals WHERE user_id = auth.uid())
  SELECT
    qr.id, qr.job_id, COALESCE(j.title, 'Conversation'), COALESCE(j.city, qr.location, ''),
    j.event_date, j.event_time, COALESCE(qr.budget_band, j.budget_band), COALESCE(j.details, qr.details),
    qr.customer_id, p.full_name, u.email::TEXT, p.phone,
    qr.last_message_at,
    (SELECT body FROM messages WHERE quote_request_id = qr.id ORDER BY created_at DESC LIMIT 1),
    (SELECT sender_id FROM messages WHERE quote_request_id = qr.id ORDER BY created_at DESC LIMIT 1),
    (SELECT source FROM messages WHERE quote_request_id = qr.id ORDER BY created_at DESC LIMIT 1),
    (SELECT count(*)::int FROM messages WHERE quote_request_id = qr.id AND sender_id <> (SELECT user_id FROM pro) AND read_at IS NULL),
    qr.status::TEXT, qr.client_status, qr.archived_by_pro, qr.hired, qr.closed
  FROM quote_requests qr
  JOIN pro ON pro.id = qr.professional_id
  LEFT JOIN jobs j ON j.id = qr.job_id
  JOIN profiles p ON p.id = qr.customer_id
  JOIN auth.users u ON u.id = qr.customer_id
  WHERE qr.deleted_by_pro = FALSE
  ORDER BY qr.last_message_at DESC NULLS LAST;
$$;

UPDATE public.quote_requests qr SET client_status = 'closed'
WHERE client_status = 'new' AND (
  qr.closed = TRUE OR qr.status = 'cancelled'
  OR NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = qr.job_id AND j.status = 'open')
);

UPDATE public.quote_requests qr SET client_status = 'contacted'
WHERE client_status = 'new'
  AND EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.professionals pr ON pr.id = qr.professional_id
    WHERE m.quote_request_id = qr.id AND m.sender_id = pr.user_id
  );
