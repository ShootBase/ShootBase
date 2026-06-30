
ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'team_member';
ALTER TYPE public.staff_permission ADD VALUE IF NOT EXISTS 'analytics.view';
ALTER TYPE public.staff_permission ADD VALUE IF NOT EXISTS 'notifications.view';
