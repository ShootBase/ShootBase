
-- 1. professional_credits.country (derived from professionals.country)
ALTER TABLE public.professional_credits
  ADD COLUMN IF NOT EXISTS country text;

UPDATE public.professional_credits pc
SET country = COALESCE(p.country, 'United Kingdom')
FROM public.professionals p
WHERE pc.professional_id = p.id AND pc.country IS NULL;

UPDATE public.professional_credits SET country = 'United Kingdom' WHERE country IS NULL;
ALTER TABLE public.professional_credits ALTER COLUMN country SET DEFAULT 'United Kingdom';

CREATE OR REPLACE FUNCTION public.set_professional_credits_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL AND NEW.professional_id IS NOT NULL THEN
    SELECT country INTO NEW.country FROM public.professionals WHERE id = NEW.professional_id;
  END IF;
  IF NEW.country IS NULL THEN NEW.country := 'United Kingdom'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pc_country ON public.professional_credits;
CREATE TRIGGER trg_pc_country BEFORE INSERT ON public.professional_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_professional_credits_country();

-- 2. user_activity_log.country (from profile)
ALTER TABLE public.user_activity_log
  ADD COLUMN IF NOT EXISTS country text;

UPDATE public.user_activity_log ual
SET country = COALESCE(p.country, 'United Kingdom')
FROM public.profiles p
WHERE ual.user_id = p.id AND ual.country IS NULL;

UPDATE public.user_activity_log SET country = 'United Kingdom' WHERE country IS NULL;
ALTER TABLE public.user_activity_log ALTER COLUMN country SET DEFAULT 'United Kingdom';

CREATE OR REPLACE FUNCTION public.set_user_activity_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT country INTO NEW.country FROM public.profiles WHERE id = NEW.user_id;
  END IF;
  IF NEW.country IS NULL THEN NEW.country := 'United Kingdom'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ual_country ON public.user_activity_log;
CREATE TRIGGER trg_ual_country BEFORE INSERT ON public.user_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.set_user_activity_country();

-- 3. admin_audit_logs.country (from affected entity when known, else actor staff scope)
ALTER TABLE public.admin_audit_logs
  ADD COLUMN IF NOT EXISTS country text;

-- Backfill from entity (best-effort) then actor staff country
UPDATE public.admin_audit_logs a
SET country = p.country
FROM public.profiles p
WHERE a.country IS NULL AND a.entity_type = 'user' AND a.entity_id::uuid = p.id;

UPDATE public.admin_audit_logs a
SET country = s.country
FROM public.staff_accounts s
WHERE a.country IS NULL AND a.actor_user_id = s.user_id AND s.country IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_admin_audit_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_country text;
BEGIN
  IF NEW.country IS NOT NULL THEN RETURN NEW; END IF;

  -- Prefer explicit metadata.country
  IF NEW.metadata ? 'country' THEN
    NEW.country := NEW.metadata->>'country';
    RETURN NEW;
  END IF;

  -- Derive from affected entity when it's a user
  IF NEW.entity_type = 'user' AND NEW.entity_id IS NOT NULL THEN
    BEGIN
      SELECT country INTO v_country FROM public.profiles WHERE id = NEW.entity_id::uuid;
      IF v_country IS NOT NULL THEN NEW.country := v_country; RETURN NEW; END IF;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;

  -- Fall back to the actor's staff country (NULL for super admins → global)
  IF NEW.actor_user_id IS NOT NULL THEN
    SELECT country INTO v_country FROM public.staff_accounts WHERE user_id = NEW.actor_user_id;
    NEW.country := v_country;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_country ON public.admin_audit_logs;
CREATE TRIGGER trg_audit_country BEFORE INSERT ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_admin_audit_country();
