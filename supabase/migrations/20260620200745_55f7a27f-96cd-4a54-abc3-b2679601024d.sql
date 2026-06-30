-- Restrict public exposure of sensitive professional contact details.
-- Owner reads of these columns flow through the SECURITY DEFINER RPC
-- public.get_my_professional() and through server functions using supabaseAdmin.
REVOKE SELECT (contact_name, postcode) ON public.professionals FROM anon;
REVOKE SELECT (contact_name, postcode) ON public.professionals FROM authenticated;