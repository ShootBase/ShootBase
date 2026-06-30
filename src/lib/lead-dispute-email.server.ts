// Enqueues transactional emails for lead-dispute lifecycle events
// (submitted, approved, rejected). Also writes audit-trail entries to
// lead_report_events and creates an in-app notification for the professional
// so admins can confirm both channels were attempted.

import * as React from 'react';
import { render as renderAsync } from '@react-email/components';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEMPLATES } from '@/lib/email-templates/registry';

const SITE_NAME = 'Shootbase';
// Mailgun-verified delegated subdomain. The visible From: still uses the
// root domain (display_from_root). Using the root domain here causes
// "no_matching_sender" 403s and emails are dropped to DLQ.
const SENDER_DOMAIN = 'notify.shootbase.co.uk';
const FROM_ADDRESS = 'support@shootbase.co.uk';
const FROM_DISPLAY = 'Shootbase Support';
const APP_BASE = 'https://www.shootbase.co.uk';

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function admin(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Kind = 'submitted' | 'approve' | 'reject';

const TEMPLATE_NAME: Record<Kind, string> = {
  submitted: 'lead-dispute-submitted',
  approve: 'lead-dispute-approved',
  reject: 'lead-dispute-rejected',
};

const NOTIFICATION_COPY: Record<Kind, { title: string; body: (extras: { leadId: string; credits?: number | null }) => string }> = {
  submitted: {
    title: 'Dispute submitted',
    body: () => 'Your dispute has been received. Our team will investigate and update you if action is required.',
  },
  approve: {
    title: 'Lead refund approved',
    body: ({ leadId, credits }) =>
      `Your dispute for lead #${leadId.slice(0, 8).toUpperCase()} was approved. ${credits ?? 0} credit${(credits ?? 0) === 1 ? '' : 's'} refunded.`,
  },
  reject: {
    title: 'Lead dispute update',
    body: ({ leadId }) => `Your dispute for lead #${leadId.slice(0, 8).toUpperCase()} was reviewed and rejected. See email for details.`,
  },
};

async function dispatch(
  kind: Kind,
  reportId: string,
  adminNote?: string | null,
  opts?: { retry?: boolean },
): Promise<{ queued: boolean; reason?: string }> {
  const supabase = admin();
  if (!supabase) {
    console.warn('[lead-dispute-email] missing env, skipping');
    return { queued: false, reason: 'env_missing' };
  }

  const { data: report } = await supabase
    .from('lead_reports')
    .select('id, job_id, professional_id, status, credits_refunded_amount, resolution_note, reason, created_at, resolved_at')
    .eq('id', reportId)
    .maybeSingle();
  if (!report) return { queued: false, reason: 'report_not_found' };

  const { data: pro } = await supabase
    .from('professionals')
    .select('user_id, business_name')
    .eq('id', report.professional_id)
    .maybeSingle();
  if (!pro?.user_id) return { queued: false, reason: 'pro_not_found' };

  const baseMessageId = `lead-dispute-${kind}-${report.id}`;
  const messageId = opts?.retry
    ? `${baseMessageId}-retry-${Date.now()}`
    : baseMessageId;

  if (!opts?.retry) {
    const { data: existingEmail } = await supabase
      .from('email_send_log')
      .select('id, status, created_at, error_message')
      .eq('message_id', baseMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const pendingIsFresh =
      existingEmail?.status === 'pending' &&
      existingEmail.created_at &&
      Date.now() - new Date(existingEmail.created_at).getTime() < 5 * 60 * 1000;
    // Only a sent email or a fresh pending enqueue should suppress a new
    // dispatch. Older pending rows were the exact production failure mode: a
    // removed DB trigger created a pending log with an unverified sender, then
    // this guard prevented the server-side outcome email from ever queuing.
    if (existingEmail?.status === 'sent' || pendingIsFresh) {
      return { queued: true, reason: 'already_queued' };
    }
  }

  // In-app notification — only for 'submitted'. Approve/reject notifications
  // are created inside the admin_resolve_lead_report / _refund_lead_report
  // RPCs so they fire even if email enqueue fails.
  if (kind === 'submitted' && !opts?.retry) {
    try {
      const copy = NOTIFICATION_COPY[kind];
      await supabase.from('notifications').insert({
        user_id: pro.user_id,
        title: copy.title,
        body: copy.body({ leadId: report.job_id, credits: report.credits_refunded_amount }),
        url: '/pro/refunds',
      });
    } catch (e) {
      console.warn('[lead-dispute-email] in-app notification failed', e);
    }
  }

  // Resolve recipient email/name via auth admin API
  const { data: userRes } = await supabase.auth.admin.getUserById(pro.user_id);
  const recipientEmail = userRes?.user?.email;
  if (!recipientEmail) {
    await supabase.from('lead_report_events').insert({
      report_id: report.id,
      action: 'email_notification_failed',
      metadata: { kind, error: 'no_email', delivery_status: 'failed' },
    });
    return { queued: false, reason: 'no_email' };
  }

  const meta = (userRes.user?.user_metadata ?? {}) as Record<string, unknown>;
  const professionalName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    pro.business_name ||
    'there';

  const templateName = TEMPLATE_NAME[kind];
  const entry = TEMPLATES[templateName];
  if (!entry) return { queued: false, reason: 'template_missing' };

  const decisionDate = report.resolved_at
    ? new Date(report.resolved_at).toLocaleString('en-GB')
    : new Date().toLocaleString('en-GB');

  const templateData =
    kind === 'submitted'
      ? {
          professionalName,
          leadId: report.job_id,
          reportId: report.id,
          reason: report.reason,
          submittedAt: new Date(report.created_at).toLocaleString('en-GB'),
        }
      : kind === 'approve'
      ? {
          professionalName,
          leadId: report.job_id,
          reportId: report.id,
          credits: report.credits_refunded_amount ?? 0,
          decisionDate,
          dashboardUrl: `${APP_BASE}/pro/dashboard`,
        }
      : {
          professionalName,
          leadId: report.job_id,
          reportId: report.id,
          adminNotes: adminNote || report.resolution_note || null,
          decisionDate,
          supportUrl: `${APP_BASE}/help`,
        };

  const subject =
    typeof entry.subject === 'function' ? entry.subject(templateData) : entry.subject;
  const html = await renderAsync(
    React.createElement(entry.component as any, templateData as any),
  );
  const text = await renderAsync(
    React.createElement(entry.component as any, templateData as any),
    { plainText: true },
  );

  const unsubToken = generateToken();
  const { error: tokenErr } = await supabase
    .from('email_unsubscribe_tokens')
    .insert({ token: unsubToken, email: recipientEmail.toLowerCase() })
    .select()
    .single();
  if (tokenErr && !String(tokenErr.message).toLowerCase().includes('duplicate')) {
    console.warn('[lead-dispute-email] token insert failed', tokenErr);
  }

  const metadata = { report_id: report.id, job_id: report.job_id, kind, retry: !!opts?.retry };

  const payload = {
    message_id: messageId,
    to: recipientEmail,
    from: `${FROM_DISPLAY} <${FROM_ADDRESS}>`,
    subject,
    html,
    text,
    purpose: 'transactional',
    label: templateName,
    idempotency_key: messageId,
    unsubscribe_token: unsubToken,
    queued_at: new Date().toISOString(),
    reply_to: FROM_ADDRESS,
    sender_domain: SENDER_DOMAIN,
    metadata,
  };

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: recipientEmail,
    status: 'pending',
    metadata,
  });

  const { error: enqErr } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload,
  });

  await supabase.from('lead_report_events').insert({
    report_id: report.id,
    action: enqErr ? 'email_notification_failed' : (opts?.retry ? 'email_notification_retried' : 'email_notification_sent'),
    metadata: {
      message_id: messageId,
      template: templateName,
      kind,
      recipient_email: recipientEmail,
      delivery_status: enqErr ? 'failed' : 'pending',
      error: enqErr ? enqErr.message : null,
      retry: !!opts?.retry,
      queued_at: new Date().toISOString(),
    },
  });

  if (enqErr) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipientEmail,
      status: 'failed',
      error_message: enqErr.message,
      metadata,
    });
  }

  if (enqErr) {
    console.warn('[lead-dispute-email] enqueue failed', enqErr);
    return { queued: false, reason: 'enqueue_failed' };
  }
  return { queued: true };
}

export interface SendLeadDisputeOutcomeArgs {
  reportId: string;
  decision: 'approve' | 'reject';
  adminNote?: string | null;
  retry?: boolean;
}

export function sendLeadDisputeOutcomeEmail(
  args: SendLeadDisputeOutcomeArgs,
): Promise<{ queued: boolean; reason?: string }> {
  return dispatch(args.decision, args.reportId, args.adminNote, { retry: args.retry });
}

export function sendLeadDisputeSubmittedEmail(
  reportId: string,
): Promise<{ queued: boolean; reason?: string }> {
  return dispatch('submitted', reportId);
}

