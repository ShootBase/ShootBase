import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const SCHEMA = z.object({
  message: z.string().trim().min(1, 'Message is required').max(5000),
  subject: z.string().trim().max(200).optional().nullable(),
  category: z.string().trim().max(100).optional().nullable(),
  attachment_paths: z.array(z.string().max(500)).max(10).optional().default([]),
});

export const createSupportRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, account_type')
      .eq('id', userId)
      .maybeSingle();

    const email = typeof claims.email === 'string' ? claims.email : null;
    const role = (profile?.account_type as string | undefined) ?? null;

    const { data: row, error } = await supabase
      .from('support_requests')
      .insert({
        user_id: userId,
        name: profile?.full_name ?? null,
        email,
        role,
        subject: data.subject ?? null,
        category: data.category ?? null,
        message: data.message,
        attachment_paths: data.attachment_paths ?? [],
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    // AI triage (priority + sentiment). Non-fatal.
    try {
      const { classifyTicket } = await import('@/lib/ai-triage.server');
      const triage = await classifyTicket({
        category: data.category ?? null,
        message: data.message,
        role,
      });
      if (triage) {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        await supabaseAdmin
          .from('support_requests')
          .update({
            ai_priority: triage.priority,
            ai_priority_confidence: triage.priority_confidence,
            ai_sentiment: triage.sentiment,
            ai_sentiment_confidence: triage.sentiment_confidence,
            ai_keywords: triage.keywords,
            ai_reasoning: triage.reasoning,
            ai_classified_at: new Date().toISOString(),
            // Apply AI priority unless an admin has already overridden it.
            priority: triage.priority,
          })
          .eq('id', row.id)
          .eq('priority_overridden', false);
      }
    } catch (err) {
      console.warn('[support] ai triage failed', err);
    }

    try {
      const { enqueueSupportTicketNotification } = await import('@/lib/support-email.server');
      await enqueueSupportTicketNotification({
        ticketId: row.id,
        submitterName: profile?.full_name ?? null,
        submitterEmail: email,
        submitterRole: role,
        subject: data.subject ?? null,
        category: data.category ?? null,
        message: data.message,
        attachmentCount: data.attachment_paths?.length ?? 0,
      });
    } catch (err) {
      console.warn('[support] notify enqueue failed', err);
    }

    try {
      const { notifyAdmins } = await import('@/lib/admin-notify.server');
      await notifyAdmins({
        type: 'support_ticket',
        title: `New support ticket${data.subject ? ` — ${data.subject}` : ''}`,
        message: data.message,
        link: `/admin/tickets/${row.id}`,
        refId: row.id,
        category: data.category ?? null,
        userId,
        userName: profile?.full_name ?? null,
        userEmail: email,
        userRole: role,
        relatedTicketId: row.id,
      });
    } catch (err) {
      console.warn('[support] admin bell notify failed', err);
    }

    return { ok: true as const, id: row.id };
  });
