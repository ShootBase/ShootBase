
ALTER TABLE public.professional_credits
  ADD COLUMN IF NOT EXISTS referred_by_pro_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_bonus_granted boolean NOT NULL DEFAULT false;
