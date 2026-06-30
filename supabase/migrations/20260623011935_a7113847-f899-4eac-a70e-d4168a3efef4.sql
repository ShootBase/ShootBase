
-- Referral codes
CREATE TABLE public.referral_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'user' CHECK (kind IN ('user','admin')),
  reward_for_referrer INTEGER NOT NULL DEFAULT 0,
  reward_for_referee INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with users.view can read referral codes"
  ON public.referral_codes FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'users.view'::public.staff_permission)
         OR owner_user_id = auth.uid());

CREATE POLICY "Staff with settings.manage can write referral codes"
  ON public.referral_codes FOR ALL TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'settings.manage'::public.staff_permission))
  WITH CHECK (public.has_staff_permission(auth.uid(), 'settings.manage'::public.staff_permission));

-- Promo codes
CREATE TABLE public.promo_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','fixed','credits')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  applies_to_role TEXT CHECK (applies_to_role IN ('customer','professional')),
  applies_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO authenticated;
GRANT ALL ON public.promo_codes TO service_role;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with users.view can read promo codes"
  ON public.promo_codes FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'users.view'::public.staff_permission));

CREATE POLICY "Staff with settings.manage can write promo codes"
  ON public.promo_codes FOR ALL TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'settings.manage'::public.staff_permission))
  WITH CHECK (public.has_staff_permission(auth.uid(), 'settings.manage'::public.staff_permission));

-- Promo redemptions
CREATE TABLE public.promo_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  promo_code_id UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, DELETE ON public.promo_redemptions TO authenticated;
GRANT ALL ON public.promo_redemptions TO service_role;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with users.view can read redemptions"
  ON public.promo_redemptions FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'users.view'::public.staff_permission)
         OR user_id = auth.uid());

CREATE POLICY "Staff with settings.manage can manage redemptions"
  ON public.promo_redemptions FOR ALL TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'settings.manage'::public.staff_permission))
  WITH CHECK (public.has_staff_permission(auth.uid(), 'settings.manage'::public.staff_permission));

-- Updated_at triggers
CREATE TRIGGER tg_referral_codes_updated BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER tg_promo_codes_updated BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_promo_redemptions_user ON public.promo_redemptions(user_id);
CREATE INDEX idx_promo_redemptions_code ON public.promo_redemptions(promo_code_id);
CREATE INDEX idx_referral_codes_owner ON public.referral_codes(owner_user_id);
