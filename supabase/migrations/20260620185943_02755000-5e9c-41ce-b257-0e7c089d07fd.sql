
-- 1. Notification preferences table
CREATE TYPE public.lead_email_mode AS ENUM ('instant', 'daily', 'weekly', 'off');

CREATE TABLE public.pro_notification_prefs (
  professional_id UUID PRIMARY KEY REFERENCES public.professionals(id) ON DELETE CASCADE,
  lead_email_mode public.lead_email_mode NOT NULL DEFAULT 'instant',
  lead_inapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_digest_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_notification_prefs TO authenticated;
GRANT ALL ON public.pro_notification_prefs TO service_role;

ALTER TABLE public.pro_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pros read own prefs" ON public.pro_notification_prefs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));

CREATE POLICY "Pros upsert own prefs" ON public.pro_notification_prefs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));

CREATE POLICY "Pros update own prefs" ON public.pro_notification_prefs
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));

CREATE TRIGGER pro_notification_prefs_set_updated_at
  BEFORE UPDATE ON public.pro_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. Tracking table
CREATE TABLE public.lead_match_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  email_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending','queued','sent','deferred','skipped_pref','skipped_suppressed','failed','digest_sent')),
  email_message_id TEXT,
  inapp_sent_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, professional_id)
);

CREATE INDEX lmn_pro_created_idx ON public.lead_match_notifications (professional_id, created_at DESC);
CREATE INDEX lmn_status_idx ON public.lead_match_notifications (email_status) WHERE email_status IN ('pending','deferred');

GRANT SELECT ON public.lead_match_notifications TO authenticated;
GRANT ALL ON public.lead_match_notifications TO service_role;

ALTER TABLE public.lead_match_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pros read own match notifications" ON public.lead_match_notifications
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));

CREATE TRIGGER lead_match_notifications_set_updated_at
  BEFORE UPDATE ON public.lead_match_notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Replace match trigger to also write tracking rows and honor prefs/suppression
CREATE OR REPLACE FUNCTION public.tg_match_pros_on_new_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pro RECORD;
  _count INTEGER := 0;
  _max INTEGER := 5;
  _pref public.lead_email_mode;
  _inapp BOOLEAN;
  _email TEXT;
  _suppressed BOOLEAN;
  _email_status TEXT;
BEGIN
  IF NEW.status <> 'open' OR NEW.service_id IS NULL THEN RETURN NEW; END IF;

  FOR _pro IN
    SELECT DISTINCT pr.id, pr.user_id, pr.rating_avg
    FROM public.professional_services ps
    JOIN public.professionals pr ON pr.id = ps.professional_id
    WHERE ps.service_id = NEW.service_id
      AND pr.status = 'active'
      AND pr.city ILIKE NEW.city
    ORDER BY pr.rating_avg DESC NULLS LAST
    LIMIT _max
  LOOP
    INSERT INTO public.lead_matches (job_id, professional_id)
      VALUES (NEW.id, _pro.id) ON CONFLICT DO NOTHING;

    -- Load prefs (default instant/inapp ON when missing)
    SELECT lead_email_mode, lead_inapp_enabled INTO _pref, _inapp
      FROM public.pro_notification_prefs WHERE professional_id = _pro.id;
    _pref := COALESCE(_pref, 'instant'::public.lead_email_mode);
    _inapp := COALESCE(_inapp, TRUE);

    -- Suppression check
    SELECT email::TEXT INTO _email FROM auth.users WHERE id = _pro.user_id;
    _suppressed := FALSE;
    IF _email IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM public.suppressed_emails WHERE email = lower(_email)) INTO _suppressed;
    END IF;

    _email_status := CASE
      WHEN _pref = 'off' THEN 'skipped_pref'
      WHEN _suppressed THEN 'skipped_suppressed'
      WHEN _pref IN ('daily','weekly') THEN 'deferred'
      ELSE 'pending'
    END;

    INSERT INTO public.lead_match_notifications (job_id, professional_id, email_status, inapp_sent_at)
      VALUES (NEW.id, _pro.id, _email_status,
              CASE WHEN _inapp THEN now() ELSE NULL END)
      ON CONFLICT (job_id, professional_id) DO NOTHING;

    IF _inapp THEN
      INSERT INTO public.notifications (user_id, title, body, url)
        VALUES (_pro.user_id,
                'New ' || NEW.title || ' lead',
                'New lead in ' || NEW.city || '. Unlock to view customer details.',
                '/pro/leads?job=' || NEW.id::text);
    END IF;

    _count := _count + 1;
  END LOOP;

  -- Fallback: relax city if we matched fewer than 3
  IF _count < 3 THEN
    FOR _pro IN
      SELECT DISTINCT pr.id, pr.user_id, pr.rating_avg
      FROM public.professional_services ps
      JOIN public.professionals pr ON pr.id = ps.professional_id
      WHERE ps.service_id = NEW.service_id
        AND pr.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.lead_match_notifications lmn
          WHERE lmn.job_id = NEW.id AND lmn.professional_id = pr.id
        )
      ORDER BY pr.rating_avg DESC NULLS LAST
      LIMIT (_max - _count)
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
        ELSE 'pending'
      END;

      INSERT INTO public.lead_match_notifications (job_id, professional_id, email_status, inapp_sent_at)
        VALUES (NEW.id, _pro.id, _email_status,
                CASE WHEN _inapp THEN now() ELSE NULL END)
        ON CONFLICT (job_id, professional_id) DO NOTHING;

      IF _inapp THEN
        INSERT INTO public.notifications (user_id, title, body, url)
          VALUES (_pro.user_id,
                  'New ' || NEW.title || ' lead',
                  'New lead in ' || NEW.city || '. Unlock to view customer details.',
                  '/pro/leads?job=' || NEW.id::text);
      END IF;

      _count := _count + 1;
      EXIT WHEN _count >= 3;
    END LOOP;
  END IF;

  RETURN NEW;
END
$function$;

-- 4. Helper RPC used by the dashboard to surface matches
CREATE OR REPLACE FUNCTION public.my_matching_leads()
 RETURNS TABLE (
   notification_id UUID,
   job_id UUID,
   created_at TIMESTAMPTZ,
   email_status TEXT,
   title TEXT,
   city TEXT,
   service_name TEXT,
   event_date DATE,
   budget_band TEXT,
   summary TEXT,
   urgency TEXT,
   unlocked BOOLEAN
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pro AS (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  SELECT lmn.id, j.id, lmn.created_at, lmn.email_status,
         j.title, j.city, s.name, j.event_date, j.budget_band, j.summary, j.urgency,
         EXISTS (SELECT 1 FROM public.lead_unlocks lu WHERE lu.job_id = j.id AND lu.professional_id = (SELECT id FROM pro))
  FROM public.lead_match_notifications lmn
  JOIN public.jobs j ON j.id = lmn.job_id
  LEFT JOIN public.services s ON s.id = j.service_id
  WHERE lmn.professional_id = (SELECT id FROM pro)
    AND j.status = 'open'
    AND j.expires_at > now()
  ORDER BY lmn.created_at DESC
  LIMIT 50;
$function$;
