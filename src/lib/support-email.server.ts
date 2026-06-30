// Enqueues support ticket emails when a new support ticket is created:
//   1. A notification to the configurable Support Email (defaults to
//      support@shootbase.co.uk) containing the full ticket details.
//   2. A confirmation to the user who raised the ticket so they have a
//      record of their request and can reply by email.

import * as React from 'react';
import { render as renderAsync } from '@react-email/components';
import { createClient } from '@supabase/supabase-js';
import { TEMPLATES } from '@/lib/email-templates/registry';

const SENDER_DOMAIN = 'notify.shootbase.co.uk';
const FROM_DOMAIN = 'shootbase.co.uk';
const SUPPORT_ADDRESS = `support@${FROM_DOMAIN}`;
const FROM_DISPLAY = 'Shootbase Support';
const FALLBACK_SUPPORT_EMAIL = SUPPORT_ADDRESS;
const APP_BASE = 'https://www.shootbase.co.uk';

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface EnqueueSupportTicketArgs {
  ticketId: string;
  submitterName?: string | null;
  submitterEmail?: string | null;
  submitterRole?: string | null;
  subject?: string | null;
  category?: string | null;
  message: string;
  attachmentCount?: number;
}

export async function enqueueSupportTicketNotification(
  args: EnqueueSupportTicketArgs,
): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.warn('[support-email] missing env, skipping');
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve configured support email (with fallback).
  let supportRecipient = FALLBACK_SUPPORT_EMAIL;
  const { data: setting } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'support_email')
    .maybeSingle();
  const v = setting?.value;
  if (typeof v === 'string' && v.includes('@')) supportRecipient = v;

  const submittedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // -------- 1. Notification to the support inbox --------
  const notifyEntry = TEMPLATES['support-ticket-notify'];
  if (notifyEntry) {
    const notifyData = {
      ticketId: args.ticketId,
      submitterName: args.submitterName ?? null,
      submitterEmail: args.submitterEmail ?? null,
      submitterRole: args.submitterRole ?? null,
      subject: args.subject ?? null,
      category: args.category ?? null,
      message: args.message,
      attachmentCount: args.attachmentCount ?? 0,
    };
    const subjectLine =
      typeof notifyEntry.subject === 'function'
        ? notifyEntry.subject(notifyData)
        : notifyEntry.subject;
    const html = await renderAsync(
      React.createElement(notifyEntry.component as any, notifyData),
    );

    const unsubToken = generateToken();
    await supabase
      .from('email_unsubscribe_tokens')
      .insert({ token: unsubToken, email: supportRecipient.toLowerCase() })
      .select()
      .single()
      .then(({ error }) => {
        if (error && !String(error.message).toLowerCase().includes('duplicate')) {
          console.warn('[support-email] notify token insert failed', error);
        }
      });

    const { error: enqErr } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        template_name: 'support-ticket-notify',
        recipient_email: supportRecipient,
        subject: subjectLine,
        html,
        from_name: FROM_DISPLAY,
        from_address: SUPPORT_ADDRESS,
        reply_to: args.submitterEmail || SUPPORT_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        idempotency_key: `support-ticket-notify-${args.ticketId}`,
        unsubscribe_token: unsubToken,
        metadata: { ticket_id: args.ticketId },
      },
    });
    if (enqErr) console.warn('[support-email] notify enqueue failed', enqErr);
  }

  // -------- 2. Confirmation to the user --------
  const confirmEntry = TEMPLATES['support-ticket-confirmation'];
  if (confirmEntry && args.submitterEmail && args.submitterEmail.includes('@')) {
    const confirmData = {
      ticketId: args.ticketId,
      submitterName: args.submitterName ?? null,
      subject: args.subject ?? null,
      category: args.category ?? null,
      message: args.message,
      submittedAt,
      helpUrl: `${APP_BASE}/help`,
    };
    const subjectLine =
      typeof confirmEntry.subject === 'function'
        ? confirmEntry.subject(confirmData)
        : confirmEntry.subject;
    const html = await renderAsync(
      React.createElement(confirmEntry.component as any, confirmData),
    );

    const unsubToken = generateToken();
    await supabase
      .from('email_unsubscribe_tokens')
      .insert({ token: unsubToken, email: args.submitterEmail.toLowerCase() })
      .select()
      .single()
      .then(({ error }) => {
        if (error && !String(error.message).toLowerCase().includes('duplicate')) {
          console.warn('[support-email] confirm token insert failed', error);
        }
      });

    const { error: enqErr } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        template_name: 'support-ticket-confirmation',
        recipient_email: args.submitterEmail,
        subject: subjectLine,
        html,
        from_name: FROM_DISPLAY,
        from_address: SUPPORT_ADDRESS,
        reply_to: SUPPORT_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        idempotency_key: `support-ticket-confirm-${args.ticketId}`,
        unsubscribe_token: unsubToken,
        metadata: { ticket_id: args.ticketId },
      },
    });
    if (enqErr) console.warn('[support-email] confirm enqueue failed', enqErr);
  }
}
