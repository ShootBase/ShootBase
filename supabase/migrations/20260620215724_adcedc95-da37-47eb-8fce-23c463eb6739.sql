
-- Job outcome tracking
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS close_reason TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hired_through TEXT CHECK (hired_through IN ('shootbase','outside')),
  ADD COLUMN IF NOT EXISTS hired_professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hired_outside_source TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_hired_pro ON public.jobs(hired_professional_id);
CREATE INDEX IF NOT EXISTS idx_jobs_close_reason ON public.jobs(close_reason);

-- Candidate pros for the "I hired someone" picker
CREATE OR REPLACE FUNCTION public.pro_candidates_for_job(_job_id UUID)
RETURNS TABLE(
  professional_id UUID,
  business_name TEXT,
  slug TEXT,
  avatar_path TEXT,
  city TEXT,
  qr_id UUID,
  source TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = _job_id AND customer_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH src AS (
    SELECT lu.professional_id, 'unlocked'::text AS s, 1 AS prio
      FROM public.lead_unlocks lu WHERE lu.job_id = _job_id
    UNION
    SELECT qr.professional_id, 'messaged'::text, 2
      FROM public.quote_requests qr
      WHERE qr.job_id = _job_id
        AND EXISTS (SELECT 1 FROM public.messages m WHERE m.quote_request_id = qr.id)
    UNION
    SELECT cr.professional_id, 'invited'::text, 3
      FROM public.pro_contact_requests cr WHERE cr.job_id = _job_id
  ),
  ranked AS (
    SELECT professional_id, s, prio,
           ROW_NUMBER() OVER (PARTITION BY professional_id ORDER BY prio) AS rn
    FROM src
  )
  SELECT pr.id, pr.business_name, pr.slug, pr.avatar_path, pr.city,
         (SELECT qr.id FROM public.quote_requests qr
            WHERE qr.job_id = _job_id AND qr.professional_id = pr.id
            ORDER BY qr.created_at DESC LIMIT 1),
         r.s
  FROM ranked r
  JOIN public.professionals pr ON pr.id = r.professional_id
  WHERE r.rn = 1
  ORDER BY r.prio, pr.business_name;
END $$;

-- Close job with outcome tracking
CREATE OR REPLACE FUNCTION public.close_job_with_outcome(
  _job_id UUID,
  _reason TEXT,
  _hired_through TEXT DEFAULT NULL,
  _hired_pro_id UUID DEFAULT NULL,
  _outside_source TEXT DEFAULT NULL
)
RETURNS TABLE(job_id UUID, hired_qr_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _job RECORD;
  _qr_id UUID;
  _pro RECORD;
  _pro_email TEXT;
  _client_name TEXT;
  _suppressed BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _reason NOT IN ('hired','no_longer_needed','decided_not_to_proceed','posted_by_mistake','other')
     THEN RAISE EXCEPTION 'invalid_reason'; END IF;

  SELECT * INTO _job FROM public.jobs WHERE id = _job_id AND customer_id = auth.uid();
  IF _job IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF _reason = 'hired' THEN
    IF _hired_through NOT IN ('shootbase','outside') THEN RAISE EXCEPTION 'invalid_hired_through'; END IF;
    IF _hired_through = 'shootbase' AND _hired_pro_id IS NULL THEN RAISE EXCEPTION 'pro_required'; END IF;
  END IF;

  UPDATE public.jobs
    SET status = 'closed',
        closed_at = now(),
        close_reason = _reason,
        hired_through = CASE WHEN _reason='hired' THEN _hired_through ELSE NULL END,
        hired_professional_id = CASE WHEN _reason='hired' AND _hired_through='shootbase' THEN _hired_pro_id ELSE NULL END,
        hired_outside_source = CASE WHEN _reason='hired' AND _hired_through='outside' THEN _outside_source ELSE NULL END
    WHERE id = _job_id;

  IF _reason = 'hired' AND _hired_through = 'shootbase' AND _hired_pro_id IS NOT NULL THEN
    -- Find or create a quote_request thread so the client can leave a review
    SELECT id INTO _qr_id FROM public.quote_requests
      WHERE job_id = _job_id AND professional_id = _hired_pro_id AND customer_id = auth.uid()
      ORDER BY created_at DESC LIMIT 1;

    IF _qr_id IS NOT NULL THEN
      UPDATE public.quote_requests
        SET hired = TRUE, status = 'accepted', client_status = 'contacted'
        WHERE id = _qr_id;
    END IF;

    -- Bump successful intros for the pro
    UPDATE public.professionals
      SET successful_intros = COALESCE(successful_intros, 0) + 1
      WHERE id = _hired_pro_id;

    -- Mark contact request responded if exists
    UPDATE public.pro_contact_requests
      SET status = 'responded', responded_at = COALESCE(responded_at, now())
      WHERE job_id = _job_id AND professional_id = _hired_pro_id;

    -- Notify the pro
    SELECT id, user_id, business_name INTO _pro
      FROM public.professionals WHERE id = _hired_pro_id;

    IF _pro.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, url)
      VALUES (
        _pro.user_id,
        'Congratulations — you''ve been hired!',
        'The client confirmed they hired you for ' || COALESCE(_job.title, 'their project') || '. Ask them for a review.',
        CASE WHEN _qr_id IS NOT NULL THEN '/threads/' || _qr_id::text ELSE '/pro/dashboard' END
      );

      SELECT email::TEXT INTO _pro_email FROM auth.users WHERE id = _pro.user_id;
      _client_name := CASE
        WHEN COALESCE(_job.show_name_to_pros, true) THEN
          COALESCE(NULLIF(_job.client_display_name,''), NULLIF(_job.contact_name,''), 'Your client')
        ELSE 'Your client' END;

      IF _pro_email IS NOT NULL THEN
        SELECT EXISTS (SELECT 1 FROM public.suppressed_emails WHERE email = lower(_pro_email)) INTO _suppressed;
        IF NOT _suppressed THEN
          BEGIN
            PERFORM public.enqueue_email(
              'transactional_emails',
              jsonb_build_object(
                'template_name','hire-congrats',
                'recipient_email', _pro_email,
                'idempotency_key', 'hire-' || _job_id::text || '-' || _hired_pro_id::text,
                'template_data', jsonb_build_object(
                  'clientName', _client_name,
                  'jobTitle', COALESCE(_job.title,'their project'),
                  'threadUrl', CASE WHEN _qr_id IS NOT NULL
                    THEN 'https://www.shootbase.co.uk/threads/' || _qr_id::text
                    ELSE 'https://www.shootbase.co.uk/pro/dashboard' END
                )
              )
            );
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'enqueue_email failed for hire %: %', _job_id, SQLERRM;
          END;
        END IF;
      END IF;
    END IF;

    RETURN QUERY SELECT _job_id, _qr_id;
  ELSE
    RETURN QUERY SELECT _job_id, NULL::UUID;
  END IF;
END $$;

-- Client analytics
CREATE OR REPLACE FUNCTION public.my_job_outcome_stats()
RETURNS TABLE(
  total_posted INTEGER,
  total_closed INTEGER,
  hires_shootbase INTEGER,
  hires_outside INTEGER,
  conversion_pct INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH s AS (
    SELECT
      count(*)::int AS total_posted,
      count(*) FILTER (WHERE status='closed')::int AS total_closed,
      count(*) FILTER (WHERE hired_through='shootbase')::int AS hires_shootbase,
      count(*) FILTER (WHERE hired_through='outside')::int AS hires_outside
    FROM public.jobs WHERE customer_id = auth.uid()
  )
  SELECT total_posted, total_closed, hires_shootbase, hires_outside,
    CASE WHEN total_posted=0 THEN 0 ELSE (100 * hires_shootbase / total_posted)::int END
  FROM s;
$$;
