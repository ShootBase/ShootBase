
ALTER TABLE public.lead_reports
  ADD COLUMN IF NOT EXISTS twilio_status text
    CHECK (twilio_status IS NULL OR twilio_status IN ('inactive','active','unknown')),
  ADD COLUMN IF NOT EXISTS twilio_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS twilio_details jsonb;
