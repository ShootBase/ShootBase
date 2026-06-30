
DROP POLICY IF EXISTS "portfolio images owner write" ON storage.objects;
CREATE POLICY "portfolio images owner write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'portfolio-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "portfolio images owner update" ON storage.objects;
CREATE POLICY "portfolio images owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'portfolio-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "portfolio images owner delete" ON storage.objects;
CREATE POLICY "portfolio images owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'portfolio-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "portfolio images public read" ON storage.objects;
CREATE POLICY "portfolio images public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'portfolio-images');

ALTER TABLE public.portfolio_items
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.pro_has_active_subscription(_pro_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.credit_subscriptions
    WHERE professional_id = _pro_id
      AND status IN ('active','trialing')
      AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.portfolio_limit_for(_pro_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN public.pro_has_active_subscription(_pro_id) THEN 20 ELSE 10 END;
$$;

CREATE OR REPLACE FUNCTION public.my_portfolio()
RETURNS TABLE(
  id UUID, image_url TEXT, caption TEXT, display_order INTEGER, created_at TIMESTAMPTZ,
  total INTEGER, max_items INTEGER, has_subscription BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _pro_id UUID; _max INT; _has_sub BOOLEAN; _total INT;
BEGIN
  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = auth.uid();
  IF _pro_id IS NULL THEN RETURN; END IF;
  _has_sub := public.pro_has_active_subscription(_pro_id);
  _max := CASE WHEN _has_sub THEN 20 ELSE 10 END;
  SELECT count(*)::int INTO _total FROM public.portfolio_items WHERE professional_id = _pro_id;
  RETURN QUERY
    SELECT pi.id, pi.image_url, pi.caption, pi.display_order, pi.created_at,
           _total, _max, _has_sub
    FROM public.portfolio_items pi
    WHERE pi.professional_id = _pro_id
    ORDER BY pi.display_order ASC, pi.created_at ASC;
END $$;

CREATE OR REPLACE FUNCTION public.add_portfolio_item(_image_url TEXT, _caption TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _pro_id UUID; _max INT; _count INT; _next INT; _id UUID;
BEGIN
  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = auth.uid();
  IF _pro_id IS NULL THEN RAISE EXCEPTION 'no_professional_profile'; END IF;
  _max := public.portfolio_limit_for(_pro_id);
  SELECT count(*)::int INTO _count FROM public.portfolio_items WHERE professional_id = _pro_id;
  IF _count >= _max THEN RAISE EXCEPTION 'portfolio_limit_reached'; END IF;
  SELECT COALESCE(MAX(display_order), -1) + 1 INTO _next FROM public.portfolio_items WHERE professional_id = _pro_id;
  INSERT INTO public.portfolio_items (professional_id, image_url, caption, display_order)
    VALUES (_pro_id, _image_url, NULLIF(trim(_caption), ''), _next)
    RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.reorder_portfolio(_ordered_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _pro_id UUID; _i INT;
BEGIN
  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = auth.uid();
  IF _pro_id IS NULL THEN RAISE EXCEPTION 'no_professional_profile'; END IF;
  FOR _i IN 1 .. array_length(_ordered_ids, 1) LOOP
    UPDATE public.portfolio_items
      SET display_order = _i - 1
      WHERE id = _ordered_ids[_i] AND professional_id = _pro_id;
  END LOOP;
END $$;
