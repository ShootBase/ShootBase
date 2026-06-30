CREATE OR REPLACE FUNCTION public.my_invited_pros(_job_id UUID)
RETURNS TABLE (
  id UUID,
  professional_id UUID,
  slug TEXT,
  business_name TEXT,
  city TEXT,
  avatar_path TEXT,
  is_verified BOOLEAN,
  status TEXT,
  created_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  unlocked_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.customer_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT cr.id, pr.id, pr.slug, pr.business_name, pr.city, pr.avatar_path, pr.is_verified,
         cr.status::TEXT, cr.created_at, cr.viewed_at, cr.unlocked_at, cr.responded_at
  FROM public.pro_contact_requests cr
  JOIN public.professionals pr ON pr.id = cr.professional_id
  WHERE cr.job_id = _job_id
  ORDER BY cr.created_at DESC;
END $$;