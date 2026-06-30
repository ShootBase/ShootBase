
-- ============ REVIEWS: extend with title, category, etc ============
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS project_category text,
  ADD COLUMN IF NOT EXISTS would_recommend boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS hidden_reason text,
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_thread
  ON public.reviews (quote_request_id, customer_id);

-- ============ REVIEW REPLIES ============
CREATE TABLE IF NOT EXISTS public.review_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL UNIQUE REFERENCES public.reviews(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'visible',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.review_replies TO anon, authenticated;
GRANT INSERT, UPDATE ON public.review_replies TO authenticated;
GRANT ALL ON public.review_replies TO service_role;
ALTER TABLE public.review_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "review replies public read" ON public.review_replies
  FOR SELECT TO anon, authenticated USING (status = 'visible');
CREATE POLICY "pros write own replies" ON public.review_replies
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));
CREATE POLICY "pros update own replies" ON public.review_replies
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));

-- ============ REVIEW REPORTS ============
CREATE TABLE IF NOT EXISTS public.review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('review','reply')),
  target_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, INSERT ON public.review_reports TO authenticated;
GRANT ALL ON public.review_reports TO service_role;
ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users insert own reports" ON public.review_reports
  FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reporters and admins read" ON public.review_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update reports" ON public.review_reports
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger for replies
DROP TRIGGER IF EXISTS trg_review_replies_upd ON public.review_replies;
CREATE TRIGGER trg_review_replies_upd BEFORE UPDATE ON public.review_replies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_reviews_upd ON public.reviews;
CREATE TRIGGER trg_reviews_upd BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.can_review_pro(_pro_id uuid, _job_id uuid)
RETURNS TABLE(eligible boolean, reason text, quote_request_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _qr_id uuid; _msg_count int; _existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'not_authenticated'::text, NULL::uuid; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = _job_id AND customer_id = auth.uid()) THEN
    RETURN QUERY SELECT false, 'not_your_job'::text, NULL::uuid; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lead_unlocks WHERE job_id = _job_id AND professional_id = _pro_id) THEN
    RETURN QUERY SELECT false, 'not_unlocked'::text, NULL::uuid; RETURN;
  END IF;
  SELECT id INTO _qr_id FROM public.quote_requests
    WHERE job_id = _job_id AND professional_id = _pro_id AND customer_id = auth.uid()
    ORDER BY created_at DESC LIMIT 1;
  IF _qr_id IS NULL THEN
    RETURN QUERY SELECT false, 'no_thread'::text, NULL::uuid; RETURN;
  END IF;
  SELECT count(*) INTO _msg_count FROM public.messages WHERE quote_request_id = _qr_id;
  IF _msg_count < 1 THEN
    RETURN QUERY SELECT false, 'no_messages'::text, _qr_id; RETURN;
  END IF;
  SELECT id INTO _existing FROM public.reviews
    WHERE quote_request_id = _qr_id AND customer_id = auth.uid();
  IF _existing IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_reviewed'::text, _qr_id; RETURN;
  END IF;
  RETURN QUERY SELECT true, 'eligible'::text, _qr_id;
END $$;

CREATE OR REPLACE FUNCTION public.submit_pro_review(
  _pro_id uuid, _job_id uuid, _rating int, _title text, _body text,
  _project_category text, _would_recommend boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _qr_id uuid; _new_id uuid; _check record;
BEGIN
  SELECT * INTO _check FROM public.can_review_pro(_pro_id, _job_id);
  IF NOT _check.eligible THEN RAISE EXCEPTION '%', _check.reason; END IF;
  IF _rating < 1 OR _rating > 5 THEN RAISE EXCEPTION 'invalid_rating'; END IF;
  INSERT INTO public.reviews
    (quote_request_id, professional_id, customer_id, job_id, rating, title, body, project_category, would_recommend)
  VALUES
    (_check.quote_request_id, _pro_id, auth.uid(), _job_id, _rating, NULLIF(trim(_title),''),
     NULLIF(trim(_body),''), NULLIF(trim(_project_category),''), COALESCE(_would_recommend, true))
  RETURNING id INTO _new_id;
  RETURN _new_id;
END $$;

CREATE OR REPLACE FUNCTION public.reply_to_review(_review_id uuid, _body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _pro_id uuid; _rev RECORD; _id uuid;
BEGIN
  SELECT * INTO _rev FROM public.reviews WHERE id = _review_id;
  IF _rev IS NULL THEN RAISE EXCEPTION 'review_not_found'; END IF;
  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = auth.uid();
  IF _pro_id IS NULL OR _pro_id <> _rev.professional_id THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NULLIF(trim(_body),'') IS NULL THEN RAISE EXCEPTION 'empty_body'; END IF;
  INSERT INTO public.review_replies (review_id, professional_id, body)
    VALUES (_review_id, _pro_id, trim(_body))
    ON CONFLICT (review_id) DO NOTHING
    RETURNING id INTO _id;
  IF _id IS NULL THEN RAISE EXCEPTION 'reply_exists'; END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.report_review_target(_target_type text, _target_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _target_type NOT IN ('review','reply') THEN RAISE EXCEPTION 'invalid_target'; END IF;
  INSERT INTO public.review_reports (target_type, target_id, reporter_id, reason)
    VALUES (_target_type, _target_id, auth.uid(), NULLIF(trim(_reason),''))
    RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_moderate_review(_review_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _action = 'hide' THEN
    UPDATE public.reviews SET status='hidden', hidden_at=now(), hidden_by=auth.uid(), hidden_reason=_reason WHERE id=_review_id;
  ELSIF _action = 'remove' THEN
    UPDATE public.reviews SET status='removed', hidden_at=now(), hidden_by=auth.uid(), hidden_reason=_reason WHERE id=_review_id;
  ELSIF _action = 'restore' THEN
    UPDATE public.reviews SET status='visible', hidden_at=NULL, hidden_by=NULL, hidden_reason=NULL WHERE id=_review_id;
  ELSE RAISE EXCEPTION 'invalid_action'; END IF;
END $$;

-- Public reviews + replies, projected safely
CREATE OR REPLACE FUNCTION public.get_pro_reviews(_pro_id uuid)
RETURNS TABLE(
  id uuid, rating int, title text, body text, project_category text, would_recommend boolean,
  created_at timestamptz, reviewer_first_name text, reviewer_verified boolean,
  reply_body text, reply_created_at timestamptz, reply_business_name text, reply_avatar_path text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id, r.rating, r.title, r.body, r.project_category, r.would_recommend, r.created_at,
    SPLIT_PART(COALESCE(p.full_name,''), ' ', 1),
    true,
    rr.body, rr.created_at, pr.business_name, pr.avatar_path
  FROM public.reviews r
  LEFT JOIN public.profiles p ON p.id = r.customer_id
  LEFT JOIN public.review_replies rr ON rr.review_id = r.id AND rr.status = 'visible'
  LEFT JOIN public.professionals pr ON pr.id = rr.professional_id
  WHERE r.professional_id = _pro_id AND r.status = 'visible'
  ORDER BY r.created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.get_pro_review_stats(_pro_id uuid)
RETURNS TABLE(total int, avg_rating numeric, recommend_pct int, c1 int, c2 int, c3 int, c4 int, c5 int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    count(*)::int,
    COALESCE(round(avg(rating)::numeric, 2), 0),
    CASE WHEN count(*) = 0 THEN 0 ELSE (100 * count(*) FILTER (WHERE would_recommend) / count(*))::int END,
    count(*) FILTER (WHERE rating=1)::int,
    count(*) FILTER (WHERE rating=2)::int,
    count(*) FILTER (WHERE rating=3)::int,
    count(*) FILTER (WHERE rating=4)::int,
    count(*) FILTER (WHERE rating=5)::int
  FROM public.reviews WHERE professional_id = _pro_id AND status='visible';
$$;

-- Viewer-aware contact info gating
CREATE OR REPLACE FUNCTION public.get_pro_contact_info(_pro_id uuid)
RETURNS TABLE(
  website text, instagram text, facebook text, tiktok text, linkedin text, twitter text, youtube text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _viewer uuid; _is_owner boolean; _has_unlock boolean;
BEGIN
  _viewer := auth.uid();
  IF _viewer IS NULL THEN RETURN; END IF;
  SELECT EXISTS (SELECT 1 FROM public.professionals WHERE id = _pro_id AND user_id = _viewer) INTO _is_owner;
  IF NOT _is_owner THEN
    SELECT EXISTS (
      SELECT 1 FROM public.lead_unlocks lu
      JOIN public.jobs j ON j.id = lu.job_id
      WHERE lu.professional_id = _pro_id AND j.customer_id = _viewer
    ) INTO _has_unlock;
    IF NOT _has_unlock THEN RETURN; END IF;
  END IF;
  RETURN QUERY
    SELECT p.website, p.instagram, p.facebook, p.tiktok, p.linkedin, p.twitter, p.youtube
    FROM public.professionals p WHERE p.id = _pro_id;
END $$;

-- Gate customer email/phone on my_pro_threads behind lead_unlocks
CREATE OR REPLACE FUNCTION public.my_pro_threads()
RETURNS TABLE(qr_id uuid, job_id uuid, title text, city text, event_date date, event_time time without time zone, budget_band text, details text, customer_id uuid, customer_name text, client_display_name text, customer_email text, customer_phone text, last_message_at timestamp with time zone, last_message_body text, last_message_sender uuid, last_message_source text, unread_count integer, status text, client_status text, archived_by_pro boolean, hired boolean, closed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH pro AS (SELECT id, user_id FROM public.professionals WHERE user_id = auth.uid())
  SELECT
    qr.id, qr.job_id, COALESCE(j.title, 'Conversation'), COALESCE(j.city, qr.location, ''),
    j.event_date, j.event_time, COALESCE(qr.budget_band, j.budget_band), COALESCE(j.details, qr.details),
    qr.customer_id, p.full_name,
    CASE WHEN COALESCE(j.show_name_to_pros, true) THEN COALESCE(NULLIF(j.client_display_name, ''), NULLIF(j.contact_name, ''), p.full_name)
         ELSE 'Private Client' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.lead_unlocks lu WHERE lu.job_id = qr.job_id AND lu.professional_id = qr.professional_id) THEN u.email::TEXT ELSE NULL END,
    CASE WHEN EXISTS (SELECT 1 FROM public.lead_unlocks lu WHERE lu.job_id = qr.job_id AND lu.professional_id = qr.professional_id) THEN p.phone ELSE NULL END,
    qr.last_message_at,
    (SELECT body FROM public.messages WHERE quote_request_id = qr.id ORDER BY created_at DESC LIMIT 1),
    (SELECT sender_id FROM public.messages WHERE quote_request_id = qr.id ORDER BY created_at DESC LIMIT 1),
    (SELECT source FROM public.messages WHERE quote_request_id = qr.id ORDER BY created_at DESC LIMIT 1),
    (SELECT count(*)::int FROM public.messages WHERE quote_request_id = qr.id AND sender_id <> (SELECT user_id FROM pro) AND read_at IS NULL),
    qr.status::TEXT, qr.client_status, qr.archived_by_pro, qr.hired, qr.closed
  FROM public.quote_requests qr
  JOIN pro ON pro.id = qr.professional_id
  LEFT JOIN public.jobs j ON j.id = qr.job_id
  JOIN public.profiles p ON p.id = qr.customer_id
  JOIN auth.users u ON u.id = qr.customer_id
  WHERE qr.deleted_by_pro = FALSE
  ORDER BY qr.last_message_at DESC NULLS LAST;
$$;
