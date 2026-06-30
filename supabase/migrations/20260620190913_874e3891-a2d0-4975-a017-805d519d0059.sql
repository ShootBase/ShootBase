
-- 1. Auto-create prefs on new professional
CREATE OR REPLACE FUNCTION public.tg_create_default_notif_prefs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.pro_notification_prefs (professional_id, lead_email_mode, lead_inapp_enabled)
    VALUES (NEW.id, 'instant'::public.lead_email_mode, TRUE)
    ON CONFLICT (professional_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_pro_default_notif_prefs ON public.professionals;
CREATE TRIGGER tg_pro_default_notif_prefs
  AFTER INSERT ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.tg_create_default_notif_prefs();

-- 2. Backfill existing pros
INSERT INTO public.pro_notification_prefs (professional_id, lead_email_mode, lead_inapp_enabled)
SELECT p.id, 'instant'::public.lead_email_mode, TRUE
FROM public.professionals p
LEFT JOIN public.pro_notification_prefs n ON n.professional_id = p.id
WHERE n.professional_id IS NULL;

-- 3. Add logging to the match trigger
CREATE OR REPLACE FUNCTION public.tg_match_pros_on_new_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pro RECORD; _count INTEGER := 0; _max INTEGER := 5;
  _pref public.lead_email_mode; _inapp BOOLEAN;
  _email TEXT; _suppressed BOOLEAN; _email_status TEXT;
BEGIN
  IF NEW.status <> 'open' OR NEW.service_id IS NULL THEN RETURN NEW; END IF;

  RAISE NOTICE '[lead-match] job=% service=% city=% — starting match', NEW.id, NEW.service_id, NEW.city;

  FOR _pro IN
    SELECT DISTINCT pr.id, pr.user_id, pr.rating_avg
    FROM public.professional_services ps
    JOIN public.professionals pr ON pr.id = ps.professional_id
    WHERE ps.service_id = NEW.service_id AND pr.status = 'active' AND pr.city ILIKE NEW.city
    ORDER BY pr.rating_avg DESC NULLS LAST LIMIT _max
  LOOP
    INSERT INTO public.lead_matches (job_id, professional_id)
      VALUES (NEW.id, _pro.id) ON CONFLICT DO NOTHING;

    SELECT lead_email_mode, lead_inapp_enabled INTO _pref, _inapp
      FROM public.pro_notification_prefs WHERE professional_id = _pro.id;
    _pref := COALESCE(_pref, 'instant'::public.lead_email_mode);
    _inapp := COALESCE(_inapp, TRUE);

    SELECT email::TEXT INTO _email FROM auth.users WHERE id = _pro.user_id;
    _suppressed := FALSE;
    IF _email IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM public.suppressed_emails WHERE email = lower(_email)) INTO _suppressed;
    END IF;

    _email_status := CASE
      WHEN _pref = 'off' THEN 'skipped_pref'
      WHEN _suppressed THEN 'skipped_suppressed'
      WHEN _pref IN ('daily','weekly') THEN 'deferred'
      ELSE 'pending' END;

    INSERT INTO public.lead_match_notifications (job_id, professional_id, email_status, inapp_sent_at)
      VALUES (NEW.id, _pro.id, _email_status, CASE WHEN _inapp THEN now() ELSE NULL END)
      ON CONFLICT (job_id, professional_id) DO NOTHING;

    RAISE NOTICE '[lead-match] pro=% pref=% inapp=% status=%', _pro.id, _pref, _inapp, _email_status;

    IF _inapp THEN
      INSERT INTO public.notifications (user_id, title, body, url)
        VALUES (_pro.user_id, 'New ' || NEW.title || ' lead',
                'New lead in ' || NEW.city || '. Unlock to view customer details.',
                '/pro/leads?job=' || NEW.id::text);
    END IF;

    _count := _count + 1;
  END LOOP;

  IF _count < 3 THEN
    FOR _pro IN
      SELECT DISTINCT pr.id, pr.user_id, pr.rating_avg
      FROM public.professional_services ps
      JOIN public.professionals pr ON pr.id = ps.professional_id
      WHERE ps.service_id = NEW.service_id AND pr.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM public.lead_match_notifications lmn
                        WHERE lmn.job_id = NEW.id AND lmn.professional_id = pr.id)
      ORDER BY pr.rating_avg DESC NULLS LAST LIMIT (_max - _count)
    LOOP
      INSERT INTO public.lead_matches (job_id, professional_id)
        VALUES (NEW.id, _pro.id) ON CONFLICT DO NOTHING;

      SELECT lead_email_mode, lead_inapp_enabled INTO _pref, _inapp
        FROM public.pro_notification_prefs WHERE professional_id = _pro.id;
      _pref := COALESCE(_pref, 'instant'::public.lead_email_mode);
      _inapp := COALESCE(_inapp, TRUE);

      SELECT email::TEXT INTO _email FROM auth.users WHERE id = _pro.user_id;
      _suppressed := FALSE;
      IF _email IS NOT NULL THEN
        SELECT EXISTS (SELECT 1 FROM public.suppressed_emails WHERE email = lower(_email)) INTO _suppressed;
      END IF;

      _email_status := CASE
        WHEN _pref = 'off' THEN 'skipped_pref'
        WHEN _suppressed THEN 'skipped_suppressed'
        WHEN _pref IN ('daily','weekly') THEN 'deferred'
        ELSE 'pending' END;

      INSERT INTO public.lead_match_notifications (job_id, professional_id, email_status, inapp_sent_at)
        VALUES (NEW.id, _pro.id, _email_status, CASE WHEN _inapp THEN now() ELSE NULL END)
        ON CONFLICT (job_id, professional_id) DO NOTHING;

      RAISE NOTICE '[lead-match][fallback] pro=% pref=% inapp=% status=%', _pro.id, _pref, _inapp, _email_status;

      IF _inapp THEN
        INSERT INTO public.notifications (user_id, title, body, url)
          VALUES (_pro.user_id, 'New ' || NEW.title || ' lead',
                  'New lead in ' || NEW.city || '. Unlock to view customer details.',
                  '/pro/leads?job=' || NEW.id::text);
      END IF;

      _count := _count + 1;
      EXIT WHEN _count >= 3;
    END LOOP;
  END IF;

  RAISE NOTICE '[lead-match] job=% matched_total=%', NEW.id, _count;
  RETURN NEW;
END $$;

-- 4. Admin debug view (admin-only)
CREATE OR REPLACE VIEW public.lead_notification_debug
WITH (security_invoker = true) AS
SELECT
  lmn.id AS notification_id,
  lmn.job_id,
  lmn.professional_id AS pro_id,
  pr.business_name AS pro_business_name,
  u.email::TEXT AS pro_email,
  j.title AS job_title,
  j.city AS job_city,
  s.name AS service_name,
  COALESCE(pnp.lead_email_mode, 'instant'::public.lead_email_mode) AS pref_mode,
  COALESCE(pnp.lead_inapp_enabled, TRUE) AS pref_inapp,
  lmn.email_status AS notification_status,
  CASE WHEN lmn.inapp_sent_at IS NOT NULL THEN 'in_app+email' ELSE 'email' END AS notification_type,
  lmn.created_at,
  lmn.email_sent_at AS sent_at,
  lmn.email_message_id,
  esl.status AS delivery_status,
  esl.error_message AS delivery_error,
  lmn.inapp_sent_at
FROM public.lead_match_notifications lmn
JOIN public.jobs j ON j.id = lmn.job_id
JOIN public.professionals pr ON pr.id = lmn.professional_id
LEFT JOIN auth.users u ON u.id = pr.user_id
LEFT JOIN public.services s ON s.id = j.service_id
LEFT JOIN public.pro_notification_prefs pnp ON pnp.professional_id = lmn.professional_id
LEFT JOIN LATERAL (
  SELECT status, error_message FROM public.email_send_log
  WHERE message_id = lmn.email_message_id ORDER BY created_at DESC LIMIT 1
) esl ON TRUE
WHERE public.has_role(auth.uid(), 'admin'::app_role);

GRANT SELECT ON public.lead_notification_debug TO authenticated;
