
ALTER TABLE public.bank_transfer_requests
  ADD COLUMN IF NOT EXISTS country text;

UPDATE public.bank_transfer_requests
  SET country = CASE WHEN country_code = 'NG' THEN 'Nigeria' ELSE 'United Kingdom' END
  WHERE country IS NULL;

ALTER TABLE public.bank_transfer_requests
  ALTER COLUMN country SET DEFAULT 'Nigeria';

CREATE INDEX IF NOT EXISTS bank_transfer_requests_country_idx
  ON public.bank_transfer_requests (country);
