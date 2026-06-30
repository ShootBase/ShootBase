-- PART 3: RPC functions + triggers

CREATE OR REPLACE FUNCTION public.calculate_lead_credits(_hours numeric)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT CASE WHEN _hours IS NOT NULL AND _hours >= 6 THEN 10 ELSE 8 END;
$fn$;

CREATE OR REPLACE FUNCTION public.tg_jobs_compute_marketplace()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _hours numeric;
BEGIN
  _hours := NEW.duration_hours;
  IF _hours IS NULL AND NEW.duration_days IS NOT NULL THEN _hours := NEW.duration_days * 8; END IF;
  NEW.duration_hours := _hours;
  NEW.unlock_credit_cost := public.calculate_lead_credits(_hours);
  NEW.urgency_status := CASE WHEN NEW.event_date IS NOT NULL AND NEW.event_date <= (CURRENT_DATE + INTERVAL '7 days')::date THEN 'urgent' ELSE 'normal' END;
  RETURN NEW;
END $fn$;
CREATE TRIGGER jobs_compute_marketplace BEFORE INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.tg_jobs_compute_marketplace();

CREATE OR REPLACE FUNCTION public.tg_set_job_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _days INTEGER;
BEGIN
  IF NEW.expires_at IS NULL OR NEW.expires_at = (now() + interval '7 days') THEN
    SELECT lead_expiry_days INTO _days FROM public.credit_settings WHERE id = 1;
    NEW.expires_at := now() + (COALESCE(_days, 7) || ' days')::interval;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER set_job_expiry BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.tg_set_job_expiry();

CREATE OR REPLACE FUNCTION public.tg_match_pros_on_new_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _pro RECORD; _count INTEGER := 0; _max INTEGER := 5;
BEGIN
  IF NEW.status <> 'open' OR NEW.service_id IS NULL THEN RETURN NEW; END IF;
  FOR _pro IN
    SELECT DISTINCT pr.id, pr.user_id, pr.rating_avg
    FROM public.professional_services ps
    JOIN public.professionals pr ON pr.id = ps.professional_id
    WHERE ps.service_id = NEW.service_id AND pr.status = 'active' AND pr.city ILIKE NEW.city
    ORDER BY pr.rating_avg DESC NULLS LAST LIMIT _max
  LOOP
    INSERT INTO public.lead_matches (job_id, professional_id) VALUES (NEW.id, _pro.id) ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, title, body, url)
      VALUES (_pro.user_id, 'New ' || NEW.title || ' lead', 'New lead in ' || NEW.city || '. Unlock to view customer details.', '/pro/leads');
    _count := _count + 1;
  END LOOP;
  IF _count < 3 THEN
    FOR _pro IN
      SELECT DISTINCT pr.id, pr.user_id
      FROM public.professional_services ps JOIN public.professionals pr ON pr.id = ps.professional_id
      WHERE ps.service_id = NEW.service_id AND pr.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM public.lead_matches lm WHERE lm.job_id = NEW.id AND lm.professional_id = pr.id)
      ORDER BY pr.rating_avg DESC NULLS LAST LIMIT (_max - _count)
    LOOP
      INSERT INTO public.lead_matches (job_id, professional_id) VALUES (NEW.id, _pro.id) ON CONFLICT DO NOTHING;
      INSERT INTO public.notifications (user_id, title, body, url)
        VALUES (_pro.user_id, 'New ' || NEW.title || ' lead', 'New lead in ' || NEW.city || '. Unlock to view customer details.', '/pro/leads');
      _count := _count + 1; EXIT WHEN _count >= 3;
    END LOOP;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER tg_jobs_match AFTER INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.tg_match_pros_on_new_job();

CREATE OR REPLACE FUNCTION public.unlock_job(_job_id uuid)
RETURNS TABLE(job_id uuid, quote_request_id uuid, customer_name text, customer_email text, customer_phone text, details text, title text, city text, event_date date, event_time time without time zone, budget_band text, credits_used integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _pro_id UUID; _balance INTEGER; _cost INTEGER; _existing UUID; _job RECORD; _matched BOOLEAN; _qr_id UUID;
BEGIN
  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = auth.uid();
  IF _pro_id IS NULL THEN RAISE EXCEPTION 'Not a professional'; END IF;
  SELECT * INTO _job FROM public.jobs j WHERE j.id = _job_id AND j.status = 'open';
  IF _job IS NULL THEN RAISE EXCEPTION 'Job not available'; END IF;
  IF _job.expires_at IS NOT NULL AND _job.expires_at < now() THEN RAISE EXCEPTION 'LEAD_EXPIRED'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.lead_matches lm WHERE lm.job_id = _job_id AND lm.professional_id = _pro_id) INTO _matched;
  IF NOT _matched THEN RAISE EXCEPTION 'NOT_MATCHED'; END IF;
  _cost := _job.unlock_credit_cost;
  IF _cost IS NULL THEN SELECT unlock_cost INTO _cost FROM public.credit_settings WHERE id = 1; END IF;
  SELECT lu.id INTO _existing FROM public.lead_unlocks lu WHERE lu.job_id = _job_id AND lu.professional_id = _pro_id;
  IF _existing IS NULL THEN
    SELECT pc.credit_balance INTO _balance FROM public.professional_credits pc WHERE pc.professional_id = _pro_id FOR UPDATE;
    IF _balance IS NULL THEN INSERT INTO public.professional_credits (professional_id, credit_balance) VALUES (_pro_id, 0); _balance := 0; END IF;
    IF _balance < _cost THEN RAISE EXCEPTION 'INSUFFICIENT_CREDITS'; END IF;
    UPDATE public.professional_credits pc SET credit_balance = pc.credit_balance - _cost WHERE pc.professional_id = _pro_id;
    INSERT INTO public.lead_unlocks (job_id, professional_id, credits_used) VALUES (_job_id, _pro_id, _cost);
    INSERT INTO public.credit_transactions (professional_id, amount, transaction_type, description)
      VALUES (_pro_id, -_cost, 'lead_unlock', 'Unlocked lead: ' || _job.title);
  END IF;
  SELECT qr.id INTO _qr_id FROM public.quote_requests qr
    WHERE qr.job_id = _job_id AND qr.professional_id = _pro_id AND qr.customer_id = _job.customer_id;
  IF _qr_id IS NULL THEN
    INSERT INTO public.quote_requests (job_id, customer_id, professional_id, service_id, event_date, location, budget_band, details, status, last_message_at)
    VALUES (_job_id, _job.customer_id, _pro_id, _job.service_id, _job.event_date, _job.city, _job.budget_band, _job.details, 'pending', now())
    RETURNING id INTO _qr_id;
  END IF;
  RETURN QUERY
    SELECT _job.id, _qr_id, p.full_name, u.email::TEXT, p.phone, _job.details, _job.title, _job.city, _job.event_date, _job.event_time, _job.budget_band, _cost
    FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = _job.customer_id;
END $fn$;
REVOKE ALL ON FUNCTION public.unlock_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_job(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_unlocked_leads()
RETURNS TABLE(unlock_id uuid, job_id uuid, unlocked_at timestamptz, credits_used integer, title text, city text, event_date date, event_time time without time zone, budget_band text, details text, customer_name text, customer_email text, customer_phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT lu.id, j.id, lu.unlocked_at, lu.credits_used, j.title, j.city, j.event_date, j.event_time, j.budget_band, j.details,
         p.full_name, u.email::TEXT, p.phone
  FROM public.lead_unlocks lu
  JOIN public.professionals pr ON pr.id = lu.professional_id AND pr.user_id = auth.uid()
  JOIN public.jobs j ON j.id = lu.job_id
  JOIN public.profiles p ON p.id = j.customer_id
  JOIN auth.users u ON u.id = p.id
  ORDER BY lu.unlocked_at DESC;
$fn$;
REVOKE ALL ON FUNCTION public.my_unlocked_leads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_unlocked_leads() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_pro_threads()
RETURNS TABLE(qr_id uuid, job_id uuid, title text, city text, event_date date, event_time time without time zone, budget_band text, details text, customer_id uuid, customer_name text, customer_email text, customer_phone text, last_message_at timestamptz, last_message_body text, last_message_sender uuid, last_message_source text, unread_count integer, status text, client_status text, archived_by_pro boolean, hired boolean, closed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH pro AS (SELECT id, user_id FROM professionals WHERE user_id = auth.uid())
  SELECT
    qr.id, qr.job_id, COALESCE(j.title, 'Conversation'), COALESCE(j.city, qr.location, ''),
    j.event_date, j.event_time, COALESCE(qr.budget_band, j.budget_band), COALESCE(j.details, qr.details),
    qr.customer_id, p.full_name, u.email::TEXT, p.phone, qr.last_message_at,
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
$fn$;
REVOKE ALL ON FUNCTION public.my_pro_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pro_threads() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_thread_read(_qr_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE public.messages SET read_at = now()
    WHERE quote_request_id = _qr_id AND sender_id <> auth.uid() AND read_at IS NULL
      AND EXISTS (SELECT 1 FROM public.quote_requests q WHERE q.id = _qr_id AND (q.customer_id = auth.uid() OR EXISTS (SELECT 1 FROM professionals pr WHERE pr.id = q.professional_id AND pr.user_id = auth.uid())));
END $fn$;
REVOKE ALL ON FUNCTION public.mark_thread_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_thread_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_thread_for_me(_qr_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _qr RECORD; _pro_user UUID;
BEGIN
  SELECT * INTO _qr FROM public.quote_requests WHERE id = _qr_id;
  IF _qr IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  SELECT user_id INTO _pro_user FROM public.professionals WHERE id = _qr.professional_id;
  IF auth.uid() = _qr.customer_id THEN UPDATE public.quote_requests SET deleted_by_customer = TRUE WHERE id = _qr_id;
  ELSIF auth.uid() = _pro_user THEN UPDATE public.quote_requests SET deleted_by_pro = TRUE WHERE id = _qr_id;
  ELSE RAISE EXCEPTION 'Not authorized'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.delete_thread_for_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_thread_for_me(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.browse_marketplace_leads()
RETURNS TABLE(id uuid, title text, summary text, details text, city text, postcode_prefix text, event_date date, event_time time without time zone, budget_band text, duration text, duration_days integer, duration_hours numeric, flexible_dates boolean, inspiration_links text[], expires_at timestamptz, created_at timestamptz, status text, kind text, service_name text, event_type text, unlock_credit_cost integer, urgency_status text, max_responses integer, latitude double precision, longitude double precision, response_count integer, unlocked boolean, customer_first_name text, customer_verified_phone boolean, customer_frequent_user boolean, customer_account_age_days integer, customer_previous_requests integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH pro AS (SELECT id FROM professionals WHERE user_id = auth.uid())
  SELECT j.id, j.title, j.summary, j.details, j.city, j.postcode_prefix,
    j.event_date, j.event_time, j.budget_band, j.duration, j.duration_days,
    j.duration_hours, j.flexible_dates, j.inspiration_links, j.expires_at,
    j.created_at, j.status::text, j.kind::text, s.name, j.event_type,
    j.unlock_credit_cost, j.urgency_status, j.max_responses, j.latitude, j.longitude,
    COALESCE((SELECT count(*)::int FROM quote_requests qr WHERE qr.job_id = j.id), 0),
    EXISTS (SELECT 1 FROM lead_unlocks lu WHERE lu.job_id = j.id AND lu.professional_id = (SELECT id FROM pro)),
    SPLIT_PART(COALESCE(p.full_name, ''), ' ', 1),
    COALESCE(p.verified_phone, false), COALESCE(p.frequent_user, false),
    GREATEST(0, EXTRACT(DAY FROM (now() - u.created_at))::int),
    COALESCE((SELECT count(*)::int FROM jobs j2 WHERE j2.customer_id = j.customer_id), 0)
  FROM lead_matches lm
  JOIN pro ON pro.id = lm.professional_id
  JOIN jobs j ON j.id = lm.job_id
  LEFT JOIN services s ON s.id = j.service_id
  LEFT JOIN profiles p ON p.id = j.customer_id
  LEFT JOIN auth.users u ON u.id = j.customer_id
  WHERE j.status = 'open' AND j.expires_at > now()
  ORDER BY j.created_at DESC LIMIT 200;
$fn$;
REVOKE ALL ON FUNCTION public.browse_marketplace_leads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.browse_marketplace_leads() TO authenticated;

-- Welcome credits trigger
CREATE OR REPLACE FUNCTION public.tg_grant_welcome_credits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _bonus INTEGER;
BEGIN
  SELECT welcome_bonus INTO _bonus FROM public.credit_settings WHERE id = 1;
  INSERT INTO public.professional_credits (professional_id, credit_balance, welcome_bonus_granted)
    VALUES (NEW.id, _bonus, TRUE) ON CONFLICT (professional_id) DO NOTHING;
  INSERT INTO public.credit_transactions (professional_id, amount, transaction_type, description)
    VALUES (NEW.id, _bonus, 'welcome_bonus', 'Welcome! You have received ' || _bonus || ' free credits.');
  RETURN NEW;
END $fn$;
CREATE TRIGGER tg_pro_welcome AFTER INSERT ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.tg_grant_welcome_credits();

-- Message bump/notify
CREATE OR REPLACE FUNCTION public.tg_bump_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _qr RECORD; _recipient_user_id UUID; _is_from_customer BOOLEAN;
BEGIN
  UPDATE public.quote_requests SET last_message_at = now(), updated_at = now()
    WHERE id = NEW.quote_request_id RETURNING * INTO _qr;
  _is_from_customer := (_qr.customer_id = NEW.sender_id);
  IF _is_from_customer THEN SELECT user_id INTO _recipient_user_id FROM public.professionals WHERE id = _qr.professional_id;
  ELSE _recipient_user_id := _qr.customer_id; END IF;
  IF NEW.source <> 'system' AND _recipient_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, url)
    VALUES (_recipient_user_id, 'New message', LEFT(NEW.body, 140),
      CASE WHEN _is_from_customer THEN '/pro/responses?c=' || NEW.quote_request_id::text ELSE '/threads/' || NEW.quote_request_id::text END);
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER messages_bump_thread AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.tg_bump_thread();

CREATE OR REPLACE FUNCTION public.tg_set_contacted_on_pro_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _pro_user UUID; _qr RECORD;
BEGIN
  SELECT qr.* INTO _qr FROM public.quote_requests qr WHERE qr.id = NEW.quote_request_id;
  IF _qr IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO _pro_user FROM public.professionals WHERE id = _qr.professional_id;
  IF NEW.sender_id = _pro_user AND _qr.client_status = 'new' THEN
    UPDATE public.quote_requests SET client_status = 'contacted' WHERE id = _qr.id AND client_status = 'new';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER tg_messages_set_contacted AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.tg_set_contacted_on_pro_message();

CREATE OR REPLACE FUNCTION public.tg_close_threads_on_job_close()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('closed','expired'))
     OR (TG_OP = 'DELETE') THEN
    UPDATE public.quote_requests SET client_status = 'closed', closed = TRUE, status = 'cancelled'
      WHERE job_id = COALESCE(NEW.id, OLD.id) AND client_status <> 'closed';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER tg_jobs_close_threads AFTER UPDATE OR DELETE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.tg_close_threads_on_job_close();

-- Lock down trigger fns
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_refresh_pro_rating() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_grant_welcome_credits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_bump_thread() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_contacted_on_pro_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_close_threads_on_job_close() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_match_pros_on_new_job() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_job_expiry() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_jobs_compute_marketplace() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Sensitive columns: no anon access to contact_name/postcode
REVOKE SELECT (contact_name, postcode) ON public.professionals FROM anon;

-- Storage policies
DROP POLICY IF EXISTS "Customers can upload to their own folder" ON storage.objects;
CREATE POLICY "Customers can upload to their own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-inspiration' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Customers can read their own inspiration files" ON storage.objects;
CREATE POLICY "Customers can read their own inspiration files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'job-inspiration' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Customers can delete their own inspiration files" ON storage.objects;
CREATE POLICY "Customers can delete their own inspiration files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'job-inspiration' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Pros who unlocked a job can read its inspiration files" ON storage.objects;
CREATE POLICY "Pros who unlocked a job can read its inspiration files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'job-inspiration' AND EXISTS (SELECT 1 FROM public.job_attachments ja JOIN public.lead_unlocks lu ON lu.job_id = ja.job_id JOIN public.professionals pr ON pr.id = lu.professional_id WHERE ja.storage_path = storage.objects.name AND pr.user_id = auth.uid()));

DROP POLICY IF EXISTS "pro avatars insert own" ON storage.objects;
CREATE POLICY "pro avatars insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'professional-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "pro avatars update own" ON storage.objects;
CREATE POLICY "pro avatars update own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'professional-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "pro avatars delete own" ON storage.objects;
CREATE POLICY "pro avatars delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'professional-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "pro avatars public read" ON storage.objects;
CREATE POLICY "pro avatars public read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'professional-avatars');

DROP POLICY IF EXISTS "Users can upload own support attachments" ON storage.objects;
CREATE POLICY "Users can upload own support attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'support-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can read own support attachments" ON storage.objects;
CREATE POLICY "Users can read own support attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'support-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can delete own support attachments" ON storage.objects;
CREATE POLICY "Users can delete own support attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'support-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Admins can read all support attachments" ON storage.objects;
CREATE POLICY "Admins can read all support attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'support-attachments' AND public.has_role(auth.uid(), 'admin'));