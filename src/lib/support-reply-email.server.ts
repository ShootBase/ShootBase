// Enqueues a "support-reply" transactional email to the original ticket
// submitter when an admin or staff member sends a reply from the admin
// support inbox. Returns the messageId / log key so callers can persist
// delivery tracking metadata against the reply row.

import * as React from 'react';
import { render as renderAsync } from '@react-email/components';
import { createClient } from '@supabase/supabase-js';
import { TEMPLATES } from '@/lib/email-templates/registry';

const SITE_NAME = 'Shootbase';
const SENDER_DOMAIN = 'notify.shootbase.co.uk';
const APP_BASE = 'https://www.shootbase.co.uk';
const SUPPORT_EMAIL = 'support@shootbase.co.uk';

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface EnqueueSupportReplyArgs {
  ticketId: string;
  recipientEmail: string;
  recipientName?: string | null;
  body: string;
  category?: string | null;
  replyId: string;
  /** Optional retry attempt counter — appended to the idempotency key so
   *  retries are not deduped against a previously-failed send. */
  attempt?: number;
}

export interface EnqueueSupportReplyResult {
  queued: boolean;
  messageId: string | null;
  error: string | null;
}

export async function enqueueSupportReplyEmail(
  args: EnqueueSupportReplyArgs,
): Promise<EnqueueSupportReplyResult> {
  const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { queued: false, messageId: null, error: 'Email service not configured' };
  }
  if (!args.recipientEmail || !args.recipientEmail.includes('@')) {
    return { queued: false, messageId: null, error: 'Invalid recipient email' };
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const entry = TEMPLATES['support-reply'];
  if (!entry) return { queued: false, messageId: null, error: 'Template missing' };

  // Build conversation history for the email body.
  const conversationHistory: Array<{ author: string; body: string; createdAt: string }> = [];
  const { data: ticket } = await supabase
    .from('support_requests')
    .select('name, email, message, created_at')
    .eq('id', args.ticketId)
    .maybeSingle();
  const recipientName =
    args.recipientName?.trim() ||
    ticket?.name?.trim() ||
    (ticket?.email ? ticket.email.split('@')[0] : null) ||
    'there';
  if (ticket?.message) {
    conversationHistory.push({
      author: ticket.name || ticket.email || 'Customer',
      body: ticket.message,
      createdAt: new Date(ticket.created_at).toLocaleString('en-GB'),
    });
  }
  const { data: publicReplies } = await supabase
    .from('admin_notes')
    .select('body, created_at, author_user_id')
    .eq('support_request_id', args.ticketId)
    .eq('is_public', true)
    .order('created_at', { ascending: true });
  for (const item of publicReplies ?? []) {
    conversationHistory.push({
      author: item.author_user_id ? `${SITE_NAME} Support` : (ticket?.name || ticket?.email || 'Customer'),
      body: item.body,
      createdAt: new Date(item.created_at).toLocaleString('en-GB'),
    });
  }

  const templateData = {
    recipientName,
    body: args.body,
    ticketId: args.ticketId,
    category: args.category ?? null,
    helpUrl: `${APP_BASE}/help`,
    conversationHistory,
  };
  const subject =
    typeof entry.subject === 'function' ? entry.subject(templateData) : entry.subject;

  let html: string;
  try {
    html = await renderAsync(
      React.createElement(entry.component as any, templateData),
    );
  } catch (err) {
    return {
      queued: false,
      messageId: null,
      error: err instanceof Error ? err.message : 'Render failed',
    };
  }

  const unsubToken = generateToken();
  const { error: tokenErr } = await supabase
    .from('email_unsubscribe_tokens')
    .insert({ token: unsubToken, email: args.recipientEmail.toLowerCase() })
    .select()
    .single();
  if (tokenErr && !String(tokenErr.message).toLowerCase().includes('duplicate')) {
    console.warn('[support-reply-email] token insert failed', tokenErr);
  }

  const idempotencyKey = args.attempt && args.attempt > 0
    ? `support-reply-${args.replyId}-retry-${args.attempt}`
    : `support-reply-${args.replyId}`;

  const payload = {
    template_name: 'support-reply',
    recipient_email: args.recipientEmail,
    subject,
    html,
    from_name: 'Shootbase Support',
    from_address: SUPPORT_EMAIL,
    reply_to: SUPPORT_EMAIL,
    sender_domain: SENDER_DOMAIN,
    idempotency_key: idempotencyKey,
    unsubscribe_token: unsubToken,
    metadata: { ticket_id: args.ticketId, reply_id: args.replyId },
  };

  const { error: enqErr } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload,
  });
  if (enqErr) {
    return {
      queued: false,
      messageId: idempotencyKey,
      error: enqErr.message || 'Enqueue failed',
    };
  }
  return { queued: true, messageId: idempotencyKey, error: null };
}
