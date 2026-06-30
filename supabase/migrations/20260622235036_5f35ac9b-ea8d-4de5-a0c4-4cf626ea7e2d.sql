REVOKE SELECT (contact_name, contact_phone) ON public.jobs FROM anon;
REVOKE SELECT (contact_name, contact_phone) ON public.jobs FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_my_job(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  SELECT
    to_jsonb(j)
      || jsonb_build_object(
           'service',
           CASE WHEN s.name IS NULL THEN NULL
                ELSE jsonb_build_object('name', s.name)
           END
         )
    INTO _result
  FROM public.jobs j
  LEFT JOIN public.services s ON s.id = j.service_id
  WHERE j.id = _job_id
    AND j.customer_id = auth.uid();

  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_job(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_my_job(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_job(uuid) TO authenticated;