
DROP FUNCTION IF EXISTS public.unlock_job(uuid);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reply_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS archived_by_pro BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hired BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed BOOLEAN NOT NULL DEFAULT false;

UPDATE public.quote_requests SET reply_token = encode(gen_random_bytes(16),'hex') WHERE reply_token IS NULL;
ALTER TABLE public.quote_requests ALTER COLUMN reply_token SET DEFAULT encode(gen_random_bytes(16),'hex');

CREATE UNIQUE INDEX IF NOT EXISTS qr_unique_job_pro_customer
  ON public.quote_requests(job_id, professional_id, customer_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS qr_last_message_at_idx ON public.quote_requests(last_message_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.tg_bump_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _qr RECORD;
  _recipient_user_id UUID;
  _is_from_customer BOOLEAN;
BEGIN
  UPDATE public.quote_requests SET last_message_at = now(), updated_at = now()
    WHERE id = NEW.quote_request_id
    RETURNING * INTO _qr;

  _is_from_customer := (_qr.customer_id = NEW.sender_id);
  IF _is_from_customer THEN
    SELECT user_id INTO _recipient_user_id FROM public.professionals WHERE id = _qr.professional_id;
  ELSE
    _recipient_user_id := _qr.customer_id;
  END IF;

  IF NEW.source <> 'system' AND _recipient_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, url)
    VALUES (
      _recipient_user_id,
      'New message',
      LEFT(NEW.body, 140),
      CASE WHEN _is_from_customer
        THEN '/pro/responses?c=' || NEW.quote_request_id::text
        ELSE '/threads/' || NEW.quote_request_id::text END
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS messages_bump_thread ON public.messages;
CREATE TRIGGER messages_bump_thread AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_bump_thread();

CREATE OR REPLACE FUNCTION public.unlock_job(_job_id UUID)
RETURNS TABLE(job_id UUID, quote_request_id UUID, customer_name TEXT, customer_email TEXT, customer_phone TEXT, details TEXT, title TEXT, city TEXT, event_date DATE, event_time TIME WITHOUT TIME ZONE, budget_band TEXT, credits_used INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pro_id UUID; _balance INTEGER; _cost INTEGER; _existing UUID; _job RECORD; _matched BOOLEAN; _qr_id UUID;
BEGIN
  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = auth.uid();
  IF _pro_id IS NULL THEN RAISE EXCEPTION 'Not a professional'; END IF;

  SELECT * INTO _job FROM public.jobs j WHERE j.id = _job_id AND j.status = 'open';
  IF _job IS NULL THEN RAISE EXCEPTION 'Job not available'; END IF;
  IF _job.expires_at IS NOT NULL AND _job.expires_at < now() THEN RAISE EXCEPTION 'LEAD_EXPIRED'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.lead_matches lm WHERE lm.job_id = _job_id AND lm.professional_id = _pro_id) INTO _matched;
  IF NOT _matched THEN RAISE EXCEPTION 'NOT_MATCHED'; END IF;

  SELECT unlock_cost INTO _cost FROM public.credit_settings WHERE id = 1;

  SELECT lu.id INTO _existing FROM public.lead_unlocks lu WHERE lu.job_id = _job_id AND lu.professional_id = _pro_id;
  IF _existing IS NULL THEN
    SELECT pc.credit_balance INTO _balance FROM public.professional_credits pc WHERE pc.professional_id = _pro_id FOR UPDATE;
    IF _balance IS NULL THEN
      INSERT INTO public.professional_credits (professional_id, credit_balance) VALUES (_pro_id, 0);
      _balance := 0;
    END IF;
    IF _balance < _cost THEN RAISE EXCEPTION 'INSUFFICIENT_CREDITS'; END IF;

    UPDATE public.professional_credits pc SET credit_balance = pc.credit_balance - _cost WHERE pc.professional_id = _pro_id;
    INSERT INTO public.lead_unlocks (job_id, professional_id, credits_used) VALUES (_job_id, _pro_id, _cost);
    INSERT INTO public.credit_transactions (professional_id, amount, transaction_type, description)
      VALUES (_pro_id, -_cost, 'lead_unlock', 'Unlocked lead: ' || _job.title);
  END IF;

  SELECT id INTO _qr_id FROM public.quote_requests
    WHERE job_id = _job_id AND professional_id = _pro_id AND customer_id = _job.customer_id;

  IF _qr_id IS NULL THEN
    INSERT INTO public.quote_requests (job_id, customer_id, professional_id, service_id, event_date, location, budget_band, details, status, last_message_at)
    VALUES (_job_id, _job.customer_id, _pro_id, _job.service_id, _job.event_date, _job.city, _job.budget_band, _job.details, 'pending', now())
    RETURNING id INTO _qr_id;
  END IF;

  RETURN QUERY
    SELECT _job.id, _qr_id, p.full_name, u.email::TEXT, p.phone, _job.details, _job.title, _job.city, _job.event_date, _job.event_time, _job.budget_band, _cost
    FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = _job.customer_id;
END $$;

CREATE OR REPLACE FUNCTION public.my_pro_threads()
RETURNS TABLE(
  qr_id UUID, job_id UUID, title TEXT, city TEXT, event_date DATE, event_time TIME WITHOUT TIME ZONE,
  budget_band TEXT, details TEXT, customer_id UUID, customer_name TEXT, customer_email TEXT, customer_phone TEXT,
  last_message_at TIMESTAMPTZ, last_message_body TEXT, last_message_sender UUID, last_message_source TEXT,
  unread_count INT, status TEXT, archived_by_pro BOOLEAN, hired BOOLEAN, closed BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    qr.status::TEXT, qr.archived_by_pro, qr.hired, qr.closed
  FROM quote_requests qr
  JOIN pro ON pro.id = qr.professional_id
  LEFT JOIN jobs j ON j.id = qr.job_id
  JOIN profiles p ON p.id = qr.customer_id
  JOIN auth.users u ON u.id = qr.customer_id
  ORDER BY qr.last_message_at DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.mark_thread_read(_qr_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.messages SET read_at = now()
    WHERE quote_request_id = _qr_id AND sender_id <> auth.uid() AND read_at IS NULL
      AND EXISTS (SELECT 1 FROM public.quote_requests q WHERE q.id = _qr_id AND (
        q.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM professionals pr WHERE pr.id = q.professional_id AND pr.user_id = auth.uid())
      ));
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.quote_requests;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
