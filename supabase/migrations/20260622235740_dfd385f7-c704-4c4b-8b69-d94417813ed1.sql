
-- Enums
CREATE TYPE public.staff_role AS ENUM ('super_admin','admin','support_agent','moderator','finance_manager');
CREATE TYPE public.staff_permission AS ENUM (
  'users.view','users.edit','users.suspend','users.delete',
  'tickets.view','tickets.reply','tickets.manage',
  'coins.view','coins.adjust','coins.refund',
  'leads.manage','verification.manage',
  'staff.manage','settings.manage','audit.view'
);

-- staff_accounts
CREATE TABLE public.staff_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.staff_role NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  invited_by uuid REFERENCES auth.users(id),
  invited_at timestamptz,
  activated_at timestamptz DEFAULT now(),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_accounts TO authenticated;
GRANT ALL ON public.staff_accounts TO service_role;
ALTER TABLE public.staff_accounts ENABLE ROW LEVEL SECURITY;

-- staff_permission_overrides
CREATE TABLE public.staff_permission_overrides (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission public.staff_permission NOT NULL,
  effect text NOT NULL CHECK (effect IN ('allow','deny')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);
GRANT SELECT ON public.staff_permission_overrides TO authenticated;
GRANT ALL ON public.staff_permission_overrides TO service_role;
ALTER TABLE public.staff_permission_overrides ENABLE ROW LEVEL SECURITY;

-- staff_invites
CREATE TABLE public.staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.staff_role NOT NULL,
  token_hash text NOT NULL UNIQUE,
  permission_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  invited_by uuid REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  consumed_at timestamptz,
  consumed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_invites TO authenticated;
GRANT ALL ON public.staff_invites TO service_role;
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;

-- admin_audit_logs (insert-only)
CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT INSERT, SELECT ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX admin_audit_logs_created_idx ON public.admin_audit_logs (created_at DESC);
CREATE INDEX admin_audit_logs_actor_idx ON public.admin_audit_logs (actor_user_id, created_at DESC);

-- admin_notes for support tickets
CREATE TABLE public.admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_request_id uuid NOT NULL REFERENCES public.support_requests(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_notes TO authenticated;
GRANT ALL ON public.admin_notes TO service_role;
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX admin_notes_ticket_idx ON public.admin_notes (support_request_id, created_at DESC);

-- Helpers
CREATE OR REPLACE FUNCTION public.is_staff(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff_accounts WHERE user_id=_uid AND status='active');
$$;

CREATE OR REPLACE FUNCTION public.staff_role_of(_uid uuid)
RETURNS public.staff_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT role FROM public.staff_accounts WHERE user_id=_uid AND status='active';
$$;

-- Role default permissions
CREATE OR REPLACE FUNCTION public.staff_role_default_permissions(_role public.staff_role)
RETURNS public.staff_permission[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE _role
    WHEN 'super_admin' THEN ARRAY[
      'users.view','users.edit','users.suspend','users.delete',
      'tickets.view','tickets.reply','tickets.manage',
      'coins.view','coins.adjust','coins.refund',
      'leads.manage','verification.manage',
      'staff.manage','settings.manage','audit.view'
    ]::public.staff_permission[]
    WHEN 'admin' THEN ARRAY[
      'users.view','users.edit','users.suspend',
      'tickets.view','tickets.reply','tickets.manage',
      'leads.manage','verification.manage','audit.view'
    ]::public.staff_permission[]
    WHEN 'support_agent' THEN ARRAY[
      'users.view','tickets.view','tickets.reply'
    ]::public.staff_permission[]
    WHEN 'moderator' THEN ARRAY[
      'users.view','users.suspend','leads.manage','verification.manage'
    ]::public.staff_permission[]
    WHEN 'finance_manager' THEN ARRAY[
      'users.view','coins.view','coins.adjust','coins.refund'
    ]::public.staff_permission[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_staff_permission(_uid uuid, _perm public.staff_permission)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _role public.staff_role; _effect text;
BEGIN
  SELECT role INTO _role FROM public.staff_accounts WHERE user_id=_uid AND status='active';
  IF _role IS NULL THEN RETURN false; END IF;
  IF _role = 'super_admin' THEN RETURN true; END IF;
  SELECT effect INTO _effect FROM public.staff_permission_overrides WHERE user_id=_uid AND permission=_perm;
  IF _effect = 'deny' THEN RETURN false; END IF;
  IF _effect = 'allow' THEN RETURN true; END IF;
  RETURN _perm = ANY (public.staff_role_default_permissions(_role));
END $$;

CREATE OR REPLACE FUNCTION public.log_admin_action(_action text, _entity_type text, _entity_id text, _metadata jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.admin_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), _action, _entity_type, _entity_id, COALESCE(_metadata,'{}'::jsonb))
    RETURNING id INTO _id;
  RETURN _id;
END $$;

-- RLS policies
CREATE POLICY "staff read own" ON public.staff_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_staff_permission(auth.uid(),'staff.manage'));

CREATE POLICY "staff perm overrides read" ON public.staff_permission_overrides FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_staff_permission(auth.uid(),'staff.manage'));

CREATE POLICY "invites read by staff manager" ON public.staff_invites FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(),'staff.manage'));

CREATE POLICY "audit read by perm" ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(),'audit.view'));

CREATE POLICY "admin notes read by ticket viewer" ON public.admin_notes FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(),'tickets.view'));
CREATE POLICY "admin notes insert by ticket replier" ON public.admin_notes FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND public.has_staff_permission(auth.uid(),'tickets.reply'));

-- Audit logs are append-only
REVOKE UPDATE, DELETE ON public.admin_audit_logs FROM authenticated, anon, service_role;

-- Updated_at trigger for staff_accounts
CREATE TRIGGER staff_accounts_updated_at BEFORE UPDATE ON public.staff_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed: promote existing admins (user_roles.role='admin') to super_admin staff
INSERT INTO public.staff_accounts (user_id, role, status, activated_at)
  SELECT DISTINCT ur.user_id, 'super_admin'::public.staff_role, 'active', now()
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
  ON CONFLICT (user_id) DO NOTHING;
