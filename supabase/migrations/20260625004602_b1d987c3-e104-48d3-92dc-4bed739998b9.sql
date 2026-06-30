
REVOKE EXECUTE ON FUNCTION public.submit_lead_report(uuid, text, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_lead_report(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_lead_reports() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_lead_reports(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_lead_reports(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._refund_lead_report(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lead_report(uuid, text, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_lead_report(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_lead_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_lead_reports(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_lead_reports(uuid) TO authenticated;
