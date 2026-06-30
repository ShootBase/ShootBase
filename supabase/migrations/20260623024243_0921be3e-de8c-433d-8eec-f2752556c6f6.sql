DROP POLICY IF EXISTS "subs staff read" ON public.credit_subscriptions;
CREATE POLICY "subs staff read"
ON public.credit_subscriptions
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

GRANT SELECT ON public.credit_subscriptions TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'credit_subscriptions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_subscriptions';
  END IF;
END$$;

ALTER TABLE public.credit_subscriptions REPLICA IDENTITY FULL;