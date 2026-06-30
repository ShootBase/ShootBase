
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_role_of(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_staff_permission(uuid, public.staff_permission) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_role_default_permissions(public.staff_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_role_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(uuid, public.staff_permission) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_role_default_permissions(public.staff_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) TO authenticated, service_role;
