import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { requirePermission, auditLog } from '@/lib/admin/_guard';

export const getPlatformSettings = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, 'settings.manage');
    const { data, error } = await supabase
      .from('platform_settings')
      .select('key, value, updated_at');
    if (error) throw new Error(error.message);
    const map: Record<string, unknown> = {};
    for (const row of data ?? []) map[row.key] = row.value;
    return {
      support_email: (map.support_email as string | undefined) ?? 'info@shootbase.co.uk',
    };
  });

const UpdateSchema = z.object({
  support_email: z.string().trim().email('Invalid email address').max(255),
});

export const updateSupportEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, 'settings.manage');

    const { data: prev } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'support_email')
      .maybeSingle();

    const { error } = await supabase
      .from('platform_settings')
      .upsert({
        key: 'support_email',
        value: data.support_email,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
    if (error) throw new Error(error.message);

    await auditLog(supabase, 'platform_settings.update', 'platform_settings', 'support_email', {
      key: 'support_email',
      previous: prev?.value ?? null,
      next: data.support_email,
    });

    return { ok: true as const };
  });
