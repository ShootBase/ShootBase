
CREATE OR REPLACE FUNCTION public.staff_role_default_permissions(_role public.staff_role)
RETURNS public.staff_permission[]
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE _role
    WHEN 'super_admin' THEN ARRAY[
      'users.view','users.edit','users.suspend','users.delete',
      'tickets.view','tickets.reply','tickets.manage',
      'coins.view','coins.adjust','coins.refund',
      'leads.manage','verification.manage',
      'staff.manage','settings.manage','audit.view',
      'analytics.view','notifications.view'
    ]::public.staff_permission[]
    WHEN 'admin' THEN ARRAY[
      'users.view','users.edit','users.suspend',
      'tickets.view','tickets.reply','tickets.manage',
      'leads.manage','verification.manage','audit.view',
      'analytics.view','notifications.view'
    ]::public.staff_permission[]
    WHEN 'team_member' THEN ARRAY[
      'tickets.view','tickets.reply','tickets.manage',
      'analytics.view','notifications.view'
    ]::public.staff_permission[]
    WHEN 'support_agent' THEN ARRAY[
      'users.view','tickets.view','tickets.reply'
    ]::public.staff_permission[]
    WHEN 'moderator' THEN ARRAY[
      'users.view','users.suspend','leads.manage','verification.manage'
    ]::public.staff_permission[]
    WHEN 'finance_manager' THEN ARRAY[
      'users.view','coins.view','coins.adjust','coins.refund'
    ]::public.staff_permission[]
    ELSE ARRAY[]::public.staff_permission[]
  END;
$function$;
