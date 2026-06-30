import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { resolveAdminCountry, applyCountryFilter } from '@/lib/admin/country.server';

async function ensureStaff(supabase: any, userId: string) {
  const { data } = await supabase
    .from('staff_accounts')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data || data.status !== 'active') throw new Error('forbidden');
}

export type AdminBellNotification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  related_ticket_id: string | null;
  related_report_id: string | null;
  related_lead_id: string | null;
  related_job_id: string | null;
  metadata: Record<string, any> | null;
  read_at: string | null;
  created_at: string;
};

export const listAdminBellNotifications = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context.supabase, context.userId);
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    let q = context.supabase
      .from('admin_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    q = applyCountryFilter(q as any, scope) as any;
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminBellNotification[];
  });

export const adminBellUnreadCount = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context.supabase, context.userId);
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    let q = context.supabase
      .from('admin_notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    q = applyCountryFilter(q as any, scope) as any;
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  });

export const markAdminBellRead = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context.supabase, context.userId);
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    let q = context.supabase
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', data.id)
      .is('read_at', null);
    q = applyCountryFilter(q as any, scope) as any;
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const markAllAdminBellRead = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context.supabase, context.userId);
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    let q = context.supabase
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null);
    q = applyCountryFilter(q as any, scope) as any;
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
