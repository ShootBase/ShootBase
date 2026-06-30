// Enqueues bank-transfer lifecycle emails to the Professional (Nigeria-only).
// Mirrors the lead-dispute email pattern so deliveries go through the
// shared transactional queue with idempotency + send-log entries.

import * as React from 'react';
import { render as renderAsync } from '@react-email/components';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEMPLATES } from '@/lib/email-templates/registry';

const SENDER_DOMAIN = 'notify.shootbase.co.uk';
const FROM_ADDRESS = 'support@shootbase.co.uk';
const FROM_DISPLAY = 'ShootBase Nigeria Support';

function admin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function token(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function fmtAmount(minor: number): string {
  return (minor / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

export type BankTransferEmailKind = 'submitted' | 'approved' | 'rejected' | 'more_info';

const TEMPLATE_NAME: Record<BankTransferEmailKind, string> = {
  submitted: 'bank-transfer-submitted',
  approved: 'bank-transfer-approved',
  rejected: 'bank-transfer-rejected',
  more_info: 'bank-transfer-more-info',
};

export async function sendBankTransferEmail(
  kind: BankTransferEmailKind,
  transferId: string,
  extras?: { reason?: string | null; message?: string | null },
): Promise<{ queued: boolean; reason?: string }> {
  const supabase = admin();
  if (!supabase) return { queued: false, reason: 'no_env' };

  const { data: row } = await supabase
    .from('bank_transfer_requests')
    .select('id, user_id, professional_id, amount_minor, transfer_reference, package_id, credits, rejection_reason, admin_message')
    .eq('id', transferId)
    .maybeSingle();
  if (!row) return { queued: false, reason: 'not_found' };

  const { data: authUser } = await supabase.auth.admin.getUserById(row.user_id as string);
  const recipient = authUser?.user?.email;
  if (!recipient) return { queued: false, reason: 'no_email' };

  let proName: string | null = null;
  if (row.professional_id) {
    const { data: p } = await supabase
      .from('professionals')
      .select('business_name, contact_name')
      .eq('id', row.professional_id)
      .maybeSingle();
    proName = (p?.contact_name as string) || (p?.business_name as string) || null;
  }

  const templateName = TEMPLATE_NAME[kind];
  const entry = TEMPLATES[templateName];
  if (!entry) return { queued: false, reason: 'no_template' };

  const data: Record<string, any> = {
    professionalName: proName,
    amount: fmtAmount(row.amount_minor as number),
    reference: row.transfer_reference,
    packageName: row.package_id,
    credits: row.credits,
    reason: extras?.reason ?? (row.rejection_reason as string | null) ?? null,
    message: extras?.message ?? (row.admin_message as string | null) ?? null,
    submittedAt: new Date().toLocaleString('en-NG'),
  };

  const subject = typeof entry.subject === 'function' ? entry.subject(data) : entry.subject;
  const html = await renderAsync(React.createElement(entry.component as any, data));
  const messageId = `bt-${kind}-${transferId}`;

  const unsub = token();
  await supabase
    .from('email_unsubscribe_tokens')
    .insert({ token: unsub, email: recipient.toLowerCase() })
    .select()
    .single()
    .then(({ error }) => {
      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        console.warn('[bt-email] token insert failed', error);
      }
    });

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: recipient,
    status: 'pending',
    metadata: { transfer_id: transferId, kind },
  });

  const { error: enqErr } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${FROM_DISPLAY} <${FROM_ADDRESS}>`,
      subject,
      html,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: messageId,
      unsubscribe_token: unsub,
      reply_to: FROM_ADDRESS,
      sender_domain: SENDER_DOMAIN,
      metadata: { transfer_id: transferId, kind },
    },
  });

  if (enqErr) {
    console.warn('[bt-email] enqueue failed', enqErr);
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipient,
      status: 'failed',
      error_message: enqErr.message,
      metadata: { transfer_id: transferId, kind },
    });
    return { queued: false, reason: 'enqueue_failed' };
  }
  return { queued: true };
}
