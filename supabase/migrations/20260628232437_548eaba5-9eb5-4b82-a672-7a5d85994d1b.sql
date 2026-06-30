DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Portfolio videos pro upload') THEN
    CREATE POLICY "Portfolio videos pro upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'portfolio-videos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Portfolio videos pro update') THEN
    CREATE POLICY "Portfolio videos pro update" ON storage.objects
      FOR UPDATE TO authenticated USING (
        bucket_id = 'portfolio-videos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Portfolio videos pro delete') THEN
    CREATE POLICY "Portfolio videos pro delete" ON storage.objects
      FOR DELETE TO authenticated USING (
        bucket_id = 'portfolio-videos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Portfolio videos auth read') THEN
    CREATE POLICY "Portfolio videos auth read" ON storage.objects
      FOR SELECT TO authenticated USING (bucket_id = 'portfolio-videos');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.professional_has_video_services(_pro_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM professional_services ps
    JOIN services s ON s.id = ps.service_id
    WHERE ps.professional_id = _pro_id AND s.kind = 'videography'
  );
$fn$;
GRANT EXECUTE ON FUNCTION public.professional_has_video_services(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_public_portfolio_videos(_pro_id uuid)
RETURNS TABLE (
  video_id uuid,
  playback_url text,
  thumbnail_url text,
  duration_seconds int,
  title text,
  ordinal int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT v.id, v.playback_url, v.thumbnail_url, v.duration_seconds, v.title, v.position
  FROM portfolio_videos v
  WHERE v.professional_id = _pro_id
    AND v.is_active = true
    AND v.status = 'ready'
    AND public.professional_has_video_services(_pro_id)
  ORDER BY v.position NULLS LAST, v.created_at DESC
  LIMIT 2;
$fn$;
GRANT EXECUTE ON FUNCTION public.list_public_portfolio_videos(uuid) TO anon, authenticated;