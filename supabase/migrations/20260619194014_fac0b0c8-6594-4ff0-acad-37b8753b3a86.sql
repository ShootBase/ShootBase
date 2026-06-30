ALTER TABLE public.credit_settings
  ADD COLUMN IF NOT EXISTS subscription JSONB NOT NULL DEFAULT
    '{"price_id":"credits_monthly_sub","name":"Monthly Credits","credits":30,"price_pence":1999,"interval":"month"}'::jsonb;

UPDATE public.credit_settings SET
  packages = '[
    {"id":"starter","name":"Starter","credits":50,"price_pence":6000},
    {"id":"growth","name":"Growth","credits":100,"price_pence":10000},
    {"id":"pro_pack","name":"Professional Credits","credits":200,"price_pence":14999,"compare_at_pence":19900,"featured":true,"description":"200 credits to unlock customer leads"}
  ]'::jsonb,
  subscription = '{"price_id":"credits_monthly_sub","name":"Monthly Credits","credits":30,"price_pence":1999,"interval":"month"}'::jsonb
WHERE id = 1;

ALTER TABLE public.professional_credits
  ADD COLUMN IF NOT EXISTS auto_topup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_topup_last_price_id TEXT,
  ADD COLUMN IF NOT EXISTS auto_topup_in_progress BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_topup_in_progress_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE TABLE IF NOT EXISTS public.credit_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  price_id TEXT NOT NULL,
  status TEXT NOT NULL,
  credits_per_period INTEGER NOT NULL DEFAULT 30,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_subscriptions_pro_idx ON public.credit_subscriptions(professional_id);

GRANT SELECT ON public.credit_subscriptions TO authenticated;
GRANT ALL ON public.credit_subscriptions TO service_role;

ALTER TABLE public.credit_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subs owner read" ON public.credit_subscriptions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = credit_subscriptions.professional_id AND p.user_id = auth.uid()));

CREATE TRIGGER tg_credit_subscriptions_updated_at
  BEFORE UPDATE ON public.credit_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TYPE public.credit_tx_type ADD VALUE IF NOT EXISTS 'subscription_grant';
ALTER TYPE public.credit_tx_type ADD VALUE IF NOT EXISTS 'auto_topup';