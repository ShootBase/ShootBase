CREATE UNIQUE INDEX IF NOT EXISTS credit_tx_unique_stripe_purchase
  ON public.credit_transactions(stripe_payment_id)
  WHERE transaction_type = 'credit_purchase' AND stripe_payment_id IS NOT NULL;