
DO $$ BEGIN
  CREATE TYPE public.support_priority AS ENUM ('low','medium','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS priority public.support_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS first_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_due_soon_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_breach_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS support_requests_first_resp_due_idx
  ON public.support_requests (first_response_due_at)
  WHERE first_responded_at IS NULL;
CREATE INDEX IF NOT EXISTS support_requests_resolution_due_idx
  ON public.support_requests (resolution_due_at)
  WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.sla_response_hours(_priority public.support_priority)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 4 WHEN 'medium' THEN 8 ELSE 24 END;
$$;

CREATE OR REPLACE FUNCTION public.sla_resolution_hours(_priority public.support_priority)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _priority WHEN 'urgent' THEN 6 WHEN 'high' THEN 24 WHEN 'medium' THEN 48 ELSE 72 END;
$$;

CREATE OR REPLACE FUNCTION public.tg_support_requests_sla()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _base timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _base := COALESCE(NEW.created_at, now());
    NEW.first_response_due_at := _base + (public.sla_response_hours(NEW.priority) || ' hours')::interval;
    NEW.resolution_due_at := _base + (public.sla_resolution_hours(NEW.priority) || ' hours')::interval;
  ELSIF NEW.priority IS DISTINCT FROM OLD.priority THEN
    _base := COALESCE(NEW.created_at, now());
    NEW.first_response_due_at := _base + (public.sla_response_hours(NEW.priority) || ' hours')::interval;
    NEW.resolution_due_at := _base + (public.sla_resolution_hours(NEW.priority) || ' hours')::interval;
    NEW.sla_due_soon_notified_at := NULL;
    NEW.sla_breach_notified_at := NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IN ('resolved','closed')
     AND OLD.status NOT IN ('resolved','closed') THEN
    NEW.resolved_at := COALESCE(NEW.resolved_at, now());
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status NOT IN ('resolved','closed') THEN
    NEW.resolved_at := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_support_requests_sla ON public.support_requests;
CREATE TRIGGER tg_support_requests_sla
  BEFORE INSERT OR UPDATE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_requests_sla();

CREATE OR REPLACE FUNCTION public.tg_admin_notes_first_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_public THEN
    UPDATE public.support_requests
      SET first_responded_at = COALESCE(first_responded_at, now())
      WHERE id = NEW.support_request_id
        AND first_responded_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_admin_notes_first_response ON public.admin_notes;
CREATE TRIGGER tg_admin_notes_first_response
  AFTER INSERT ON public.admin_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_admin_notes_first_response();

-- Backfill existing rows
UPDATE public.support_requests
SET first_response_due_at = created_at + (public.sla_response_hours(priority) || ' hours')::interval,
    resolution_due_at = created_at + (public.sla_resolution_hours(priority) || ' hours')::interval
WHERE first_response_due_at IS NULL OR resolution_due_at IS NULL;

UPDATE public.support_requests sr
SET first_responded_at = sub.first_at
FROM (
  SELECT support_request_id, MIN(created_at) AS first_at
  FROM public.admin_notes WHERE is_public = true
  GROUP BY support_request_id
) sub
WHERE sr.id = sub.support_request_id AND sr.first_responded_at IS NULL;

UPDATE public.support_requests
SET resolved_at = updated_at
WHERE status IN ('resolved','closed') AND resolved_at IS NULL;
