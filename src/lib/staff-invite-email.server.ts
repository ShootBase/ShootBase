// Enqueues a "staff-invite" transactional email through the project's
// own email queue, bypassing Supabase's auth invite email (which silently
// no-ops for already-registered users and has been unreliable in delivery).

import * as React from 'react';
import { render as renderAsync } from '@react-email/components';
import { createClient } from '@supabase/supabase-js';
import { TEMPLATES } from '@/lib/email-templates/registry';

const SITE_NAME = 'Shootbase';
const SENDER_DOMAIN = 'notify.shootbase.co.uk';
const FROM_DOMAIN = 'shootbase.co.uk';

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface EnqueueStaffInviteArgs {
  inviteId: string;
  recipientEmail: string;
  acceptUrl: string;
  roleLabel: string;
  inviterName?: string | null;
  expiresAt?: string | null;
  /** Differentiates the original send vs a resend for idempotency. */
  attempt?: number;
}

export interface EnqueueResult {
  ok: boolean;
  error?: string;
}

export async function enqueueStaffInviteEmail(
  args: EnqueueStaffInviteArgs,
): Promise<EnqueueResult> {
  const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: 'Email service not configured' };
  }
  if (!args.recipientEmail || !args.recipientEmail.includes('@')) {
    return { ok: false, error: 'Invalid recipient email' };
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const entry = TEMPLATES['staff-invite'];
  if (!entry) return { ok: false, error: 'Staff invite template missing' };

  const templateData = {
    roleLabel: args.roleLabel,
    inviterName: args.inviterName ?? null,
    acceptUrl: args.acceptUrl,
    expiresAt: args.expiresAt ?? undefined,
    siteName: SITE_NAME,
  };
  const subject =
    typeof entry.subject === 'function' ? entry.subject(templateData) : entry.subject;
  const html = await renderAsync(
    React.createElement(entry.component as any, templateData),
  );

  const unsubToken = generateToken();
  await supabase
    .from('email_unsubscribe_tokens')
    .insert({ token: unsubToken, email: args.recipientEmail.toLowerCase() })
    .select()
    .single()
    .then(({ error }) => {
      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        console.warn('[staff-invite-email] token insert failed', error);
      }
    });

  const payload = {
    template_name: 'staff-invite',
    recipient_email: args.recipientEmail,
    subject,
    html,
    from_name: 'Shootbase Support',
    from_address: `support@${FROM_DOMAIN}`,
    reply_to: `support@${FROM_DOMAIN}`,
    sender_domain: SENDER_DOMAIN,
    idempotency_key: `staff-invite-${args.inviteId}-${args.attempt ?? 1}`,
    unsubscribe_token: unsubToken,
    metadata: { invite_id: args.inviteId },
  };

  const { error: enqErr } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload,
  });
  if (enqErr) {
    console.error('[staff-invite-email] enqueue failed', enqErr);
    return { ok: false, error: enqErr.message };
  }
  return { ok: true };
}
