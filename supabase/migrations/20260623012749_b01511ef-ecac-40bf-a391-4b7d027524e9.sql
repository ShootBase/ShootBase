
-- =========================
-- USER ACTIVITY LOG
-- =========================
CREATE TABLE public.user_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  action_description TEXT,
  entity_type TEXT,
  entity_id TEXT,
  ip TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.user_activity_log TO authenticated;
GRANT ALL ON public.user_activity_log TO service_role;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

-- Staff with users.view can read everything
CREATE POLICY "Staff can read activity"
  ON public.user_activity_log FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'users.view'::public.staff_permission)
         OR user_id = auth.uid());

-- Insert only via the SECURITY DEFINER RPC below; deny direct client inserts
CREATE POLICY "No direct inserts"
  ON public.user_activity_log FOR INSERT TO authenticated
  WITH CHECK (false);

-- No UPDATE / DELETE policies → append-only

CREATE INDEX idx_user_activity_log_user_created ON public.user_activity_log(user_id, created_at DESC);
CREATE INDEX idx_user_activity_log_type ON public.user_activity_log(action_type);
CREATE INDEX idx_user_activity_log_created ON public.user_activity_log(created_at DESC);

-- Append-only RPC (callable by signed-in users for their own events,
-- and by anyone privileged via service_role at the server function layer)
CREATE OR REPLACE FUNCTION public.log_user_activity(
  _user_id UUID,
  _action_type TEXT,
  _action_description TEXT,
  _entity_type TEXT DEFAULT NULL,
  _entity_id TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb,
  _ip TEXT DEFAULT NULL,
  _user_agent TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id UUID; _actor UUID;
BEGIN
  _actor := auth.uid();
  -- Allow if caller is the user themselves, or service_role, or has users.view permission
  IF _actor IS DISTINCT FROM _user_id
     AND NOT public.has_staff_permission(_actor, 'users.view'::public.staff_permission)
     AND current_setting('role', true) IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  INSERT INTO public.user_activity_log
    (user_id, actor_user_id, action_type, action_description, entity_type, entity_id, metadata, ip, user_agent)
  VALUES (_user_id, _actor, _action_type, _action_description, _entity_type, _entity_id,
          COALESCE(_metadata, '{}'::jsonb), _ip, _user_agent)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.log_user_activity(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_user_activity(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated, service_role;

-- =========================
-- USER RISK SCORES
-- =========================
CREATE TABLE public.user_risk_scores (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  level TEXT NOT NULL DEFAULT 'low' CHECK (level IN ('low','medium','high','critical')),
  previous_score INTEGER,
  trend TEXT NOT NULL DEFAULT 'stable' CHECK (trend IN ('rising','stable','decreasing')),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_risk_scores TO authenticated;
GRANT ALL ON public.user_risk_scores TO service_role;
ALTER TABLE public.user_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read risk scores"
  ON public.user_risk_scores FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'users.view'::public.staff_permission));

CREATE TRIGGER tg_user_risk_scores_updated BEFORE UPDATE ON public.user_risk_scores
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_user_risk_scores_level ON public.user_risk_scores(level);
CREATE INDEX idx_user_risk_scores_score ON public.user_risk_scores(score DESC);
