
-- ============ 1. Enums ============
DO $$ BEGIN
  CREATE TYPE public.app_user_tag AS ENUM ('vip','high_spender','risky','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_tag_source AS ENUM ('auto','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ 2. user_tags ============
CREATE TABLE IF NOT EXISTS public.user_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tag public.app_user_tag NOT NULL,
  source public.user_tag_source NOT NULL DEFAULT 'auto',
  reason text,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_user_tags_user ON public.user_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_tag ON public.user_tags(tag);

GRANT SELECT ON public.user_tags TO authenticated;
GRANT ALL ON public.user_tags TO service_role;
ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view tags"
  ON public.user_tags FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'users.view'::public.staff_permission));

CREATE POLICY "Self can view own tags"
  ON public.user_tags FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- writes go through SECURITY DEFINER functions / service role

-- ============ 3. vip_rewards ============
CREATE TABLE IF NOT EXISTS public.vip_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('coin_bonus','discount_code','perk','other')),
  coins integer DEFAULT 0,
  promo_code text,
  note text,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vip_rewards_user ON public.vip_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_vip_rewards_granted_at ON public.vip_rewards(granted_at DESC);

GRANT SELECT ON public.vip_rewards TO authenticated;
GRANT ALL ON public.vip_rewards TO service_role;
ALTER TABLE public.vip_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view vip rewards"
  ON public.vip_rewards FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'users.view'::public.staff_permission));

CREATE POLICY "Self can view own rewards"
  ON public.vip_rewards FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============ 4. Recompute function ============
CREATE OR REPLACE FUNCTION public.recompute_user_tags(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pro_id uuid;
  _purchased_90d int := 0;
  _activity_30d int := 0;
  _last_seen timestamptz;
  _created timestamptz;
  _risk text;
  _is_vip boolean := false;
  _is_high boolean := false;
  _is_risky boolean := false;
  _is_inactive boolean := false;
  -- thresholds (could move to platform_settings later)
  _vip_threshold int := 500;
  _high_threshold int := 200;
  _inactive_days int := 30;
BEGIN
  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = _user_id;

  IF _pro_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount),0)::int INTO _purchased_90d
    FROM public.credit_transactions
    WHERE professional_id = _pro_id
      AND amount > 0
      AND transaction_type IN ('purchase','subscription','top_up')
      AND created_at >= now() - interval '90 days';
  END IF;

  SELECT COUNT(*)::int INTO _activity_30d
  FROM public.user_activity_log
  WHERE user_id = _user_id
    AND created_at >= now() - interval '30 days';

  SELECT last_sign_in_at, created_at INTO _last_seen, _created
  FROM auth.users WHERE id = _user_id;

  SELECT level INTO _risk FROM public.user_risk_scores WHERE user_id = _user_id;

  -- Risky takes precedence and blocks VIP
  IF _risk IN ('high','critical') THEN
    _is_risky := true;
  ELSE
    IF _purchased_90d >= _vip_threshold THEN
      _is_vip := true;
    ELSIF _purchased_90d >= _high_threshold THEN
      _is_high := true;
    END IF;
  END IF;

  IF (_last_seen IS NULL OR _last_seen < now() - (_inactive_days || ' days')::interval)
     AND _activity_30d = 0
     AND COALESCE(_created, now()) < now() - interval '7 days'
  THEN
    _is_inactive := true;
  END IF;

  -- Wipe auto tags, then reinsert
  DELETE FROM public.user_tags WHERE user_id = _user_id AND source = 'auto';

  IF _is_vip THEN
    INSERT INTO public.user_tags(user_id, tag, source, reason)
    VALUES (_user_id, 'vip', 'auto',
      'Spent ' || _purchased_90d || ' coins in last 90 days')
    ON CONFLICT (user_id, tag) DO NOTHING;
  END IF;
  IF _is_high THEN
    INSERT INTO public.user_tags(user_id, tag, source, reason)
    VALUES (_user_id, 'high_spender', 'auto',
      'Spent ' || _purchased_90d || ' coins in last 90 days')
    ON CONFLICT (user_id, tag) DO NOTHING;
  END IF;
  IF _is_risky THEN
    INSERT INTO public.user_tags(user_id, tag, source, reason)
    VALUES (_user_id, 'risky', 'auto', 'Risk level: ' || _risk)
    ON CONFLICT (user_id, tag) DO NOTHING;
  END IF;
  IF _is_inactive THEN
    INSERT INTO public.user_tags(user_id, tag, source, reason)
    VALUES (_user_id, 'inactive', 'auto',
      'No sign-in for ' || _inactive_days || '+ days')
    ON CONFLICT (user_id, tag) DO NOTHING;
  END IF;
END $$;

-- Batch recompute (capped) for nightly cron
CREATE OR REPLACE FUNCTION public.recompute_all_user_tags()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _u uuid; _n int := 0;
BEGIN
  FOR _u IN
    SELECT id FROM auth.users
    ORDER BY COALESCE(last_sign_in_at, created_at) DESC
    LIMIT 5000
  LOOP
    PERFORM public.recompute_user_tags(_u);
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;

-- ============ 5. Trigger: refresh tags after coin transaction ============
CREATE OR REPLACE FUNCTION public.tg_recompute_tags_on_credit_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid;
BEGIN
  SELECT user_id INTO _uid FROM public.professionals WHERE id = NEW.professional_id;
  IF _uid IS NOT NULL THEN
    PERFORM public.recompute_user_tags(_uid);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recompute_tags_on_credit_tx ON public.credit_transactions;
CREATE TRIGGER trg_recompute_tags_on_credit_tx
AFTER INSERT ON public.credit_transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_tags_on_credit_tx();

-- ============ 6. Admin helper: grant manual tag ============
CREATE OR REPLACE FUNCTION public.admin_set_user_tag(_user_id uuid, _tag public.app_user_tag, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_staff_permission(auth.uid(), 'users.edit'::public.staff_permission) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  INSERT INTO public.user_tags(user_id, tag, source, reason, granted_by)
  VALUES (_user_id, _tag, 'manual', NULLIF(trim(_reason),''), auth.uid())
  ON CONFLICT (user_id, tag) DO UPDATE
    SET source = 'manual',
        reason = EXCLUDED.reason,
        granted_by = EXCLUDED.granted_by,
        granted_at = now();
  PERFORM public.log_admin_action('user.tag.set', 'user', _user_id::text,
    jsonb_build_object('tag', _tag, 'reason', _reason));
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_user_tag(_user_id uuid, _tag public.app_user_tag)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_staff_permission(auth.uid(), 'users.edit'::public.staff_permission) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  DELETE FROM public.user_tags WHERE user_id = _user_id AND tag = _tag;
  PERFORM public.log_admin_action('user.tag.remove', 'user', _user_id::text,
    jsonb_build_object('tag', _tag));
END $$;
