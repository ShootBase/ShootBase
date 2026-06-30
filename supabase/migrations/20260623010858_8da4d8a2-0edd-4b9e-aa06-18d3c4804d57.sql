
DO $$ BEGIN
  CREATE TYPE public.support_sentiment AS ENUM ('positive','neutral','frustrated','angry');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS ai_priority public.support_priority,
  ADD COLUMN IF NOT EXISTS ai_priority_confidence smallint,
  ADD COLUMN IF NOT EXISTS ai_sentiment public.support_sentiment,
  ADD COLUMN IF NOT EXISTS ai_sentiment_confidence smallint,
  ADD COLUMN IF NOT EXISTS ai_keywords text[],
  ADD COLUMN IF NOT EXISTS ai_reasoning text,
  ADD COLUMN IF NOT EXISTS ai_classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_overridden_by uuid,
  ADD COLUMN IF NOT EXISTS priority_overridden_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_support_requests_priority ON public.support_requests(priority);
CREATE INDEX IF NOT EXISTS idx_support_requests_ai_sentiment ON public.support_requests(ai_sentiment);
