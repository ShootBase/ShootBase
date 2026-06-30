INSERT INTO public.staff_accounts (user_id, role, status, invited_by)
SELECT u.id, 'super_admin'::public.staff_role, 'active', u.id
FROM auth.users u
WHERE u.email = 'info@shootbase.co.uk'
ON CONFLICT (user_id) DO UPDATE
  SET role = 'super_admin'::public.staff_role,
      status = 'active';