CREATE OR REPLACE FUNCTION public.my_portfolio()
RETURNS TABLE(
  id UUID, image_url TEXT, caption TEXT, display_order INTEGER, created_at TIMESTAMPTZ,
  total INTEGER, max_items INTEGER, has_subscription BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _pro_id UUID; _max INT; _has_sub BOOLEAN; _total INT;
BEGIN
  SELECT p.id INTO _pro_id FROM public.professionals p WHERE p.user_id = auth.uid();
  IF _pro_id IS NULL THEN RETURN; END IF;
  _has_sub := public.pro_has_active_subscription(_pro_id);
  _max := CASE WHEN _has_sub THEN 20 ELSE 10 END;
  SELECT count(*)::int INTO _total FROM public.portfolio_items pi WHERE pi.professional_id = _pro_id;
  RETURN QUERY
    SELECT pi.id, pi.image_url, pi.caption, pi.display_order, pi.created_at,
           _total, _max, _has_sub
    FROM public.portfolio_items pi
    WHERE pi.professional_id = _pro_id
    ORDER BY pi.display_order ASC, pi.created_at ASC;
END $$;