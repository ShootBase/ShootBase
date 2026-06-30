// Writes an admin_notifications row (powering the staff bell) and emails the
// ShootBase support inbox. Use this from any flow where staff must be alerted
// (support tickets, lead/invalid-contact reports, dispute submissions, etc.).

import * as React from 'react';
import { render as renderAsync } from '@react-email/components';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEMPLATES } from '@/lib/email-templates/registry';

const SENDER_DOMAIN = 'notify.shootbase.co.uk';
const FROM_DOMAIN = 'shootbase.co.uk';
const SUPPORT_ADDRESS = `support@${FROM_DOMAIN}`;
const FROM_DISPLAY = 'Shootbase Support';
const APP_BASE = 'https://www.shootbase.co.uk';

function admin(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type AdminAlertKind =
  | 'support_ticket'
  | 'invalid_contact_report'
  | 'lead_issue'
  | 'payment_issue'
  | 'technical_issue'
  | 'user_report'
  | 'other';

const ALERT_LABEL: Record<AdminAlertKind, string> = {
  support_ticket: 'New Support Ticket',
  invalid_contact_report: 'Invalid Contact Report',
  lead_issue: 'Lead Issue Reported',
  payment_issue: 'Payment / Coin Issue',
  technical_issue: 'Technical Issue',
  user_report: 'User Report',
  other: 'New Support Alert',
};

export interface NotifyAdminsArgs {
  type: AdminAlertKind;
  title?: string;
  message?: string;
  link?: string; // relative or absolute admin link
  refId?: string | null;
  category?: string | null;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  relatedTicketId?: string | null;
  relatedReportId?: string | null;
  relatedLeadId?: string | null;
  relatedJobId?: string | null;
  relatedJobTitle?: string | null;
  metadata?: Record<string, unknown>;
}

export async function notifyAdmins(args: NotifyAdminsArgs): Promise<void> {
  const supabase = admin();
  if (!supabase) {
    console.warn('[admin-notify] missing env, skipping');
    return;
  }

  const label = ALERT_LABEL[args.type] ?? ALERT_LABEL.other;
  const title = args.title || label;
  const absoluteLink = args.link
    ? args.link.startsWith('http')
      ? args.link
      : `${APP_BASE}${args.link.startsWith('/') ? '' : '/'}${args.link}`
    : `${APP_BASE}/admin`;

  // -------- 1. Bell row --------
  try {
    await supabase.from('admin_notifications').insert({
      type: args.type,
      title,
      message: args.message ?? null,
      link: args.link ?? '/admin',
      related_ticket_id: args.relatedTicketId ?? null,
      related_report_id: args.relatedReportId ?? null,
      related_lead_id: args.relatedLeadId ?? null,
      related_job_id: args.relatedJobId ?? null,
      source_user_id: args.userId ?? null,
      metadata: {
        ...(args.metadata ?? {}),
        category: args.category ?? null,
        user_name: args.userName ?? null,
        user_email: args.userEmail ?? null,
        user_role: args.userRole ?? null,
        related_job_title: args.relatedJobTitle ?? null,
      },
    });
  } catch (err) {
    console.warn('[admin-notify] bell insert failed', err);
  }

  // -------- 2. Email to support inbox --------
  try {
    // Resolve configured support email if set, fallback to default.
    let recipient = SUPPORT_ADDRESS;
    const { data: setting } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'support_email')
      .maybeSingle();
    const v = setting?.value as unknown;
    if (typeof v === 'string' && v.includes('@')) recipient = v;

    const entry = TEMPLATES['admin-alert'];
    if (!entry) return;
    const submittedAt = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const data = {
      alertType: label,
      title,
      refId: args.refId ?? args.relatedTicketId ?? args.relatedReportId ?? args.relatedLeadId ?? null,
      userName: args.userName ?? null,
      userEmail: args.userEmail ?? null,
      userRole: args.userRole ?? null,
      userId: args.userId ?? null,
      relatedLeadId: args.relatedLeadId ?? null,
      relatedJobTitle: args.relatedJobTitle ?? null,
      category: args.category ?? null,
      message: args.message ?? '',
      submittedAt,
      adminLink: absoluteLink,
    };
    const subject =
      typeof entry.subject === 'function' ? entry.subject(data) : entry.subject;
    const html = await renderAsync(React.createElement(entry.component as any, data));
    const idempotencyKey = `admin-alert-${args.type}-${args.refId ?? args.relatedTicketId ?? args.relatedReportId ?? args.relatedLeadId ?? generateToken().slice(0, 12)}`;

    const unsubToken = generateToken();
    await supabase
      .from('email_unsubscribe_tokens')
      .insert({ token: unsubToken, email: recipient.toLowerCase() })
      .select()
      .single()
      .then(({ error }) => {
        if (error && !String(error.message).toLowerCase().includes('duplicate')) {
          console.warn('[admin-notify] token insert failed', error);
        }
      });

    const { error: enqErr } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        template_name: 'admin-alert',
        recipient_email: recipient,
        subject: `${subject} — ShootBase`,
        html,
        from_name: FROM_DISPLAY,
        from_address: SUPPORT_ADDRESS,
        reply_to: args.userEmail || SUPPORT_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubToken,
        metadata: {
          alert_type: args.type,
          ref_id: args.refId ?? null,
        },
      },
    });
    if (enqErr) console.warn('[admin-notify] email enqueue failed', enqErr);
  } catch (err) {
    console.warn('[admin-notify] email path failed', err);
  }
}
