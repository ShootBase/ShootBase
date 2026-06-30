ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS bank_details text,
  ADD COLUMN IF NOT EXISTS payment_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS show_bank_details boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_payment_links boolean NOT NULL DEFAULT false;