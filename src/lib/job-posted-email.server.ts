// Sends the client confirmation email after a job is successfully posted.

import * as React from 'react';
import { render as renderAsync } from '@react-email/components';
import { createClient } from '@supabase/supabase-js';
import { TEMPLATES } from '@/lib/email-templates/registry';

const SENDER_DOMAIN = 'notify.shootbase.co.uk';
const FROM_DOMAIN = 'shootbase.co.uk';
const SUPPORT_ADDRESS = `support@${FROM_DOMAIN}`;
const FROM_DISPLAY = 'Shootbase Support';

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface JobPostedEmailArgs {
  jobId: string;
  jobTitle: string;
  clientName: string | null;
  clientEmail: string | null;
}

export async function sendJobPostedConfirmation(args: JobPostedEmailArgs): Promise<void> {
  if (!args.clientEmail || !args.clientEmail.includes('@')) return;

  const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.warn('[job-posted-email] missing env, skipping');
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const entry = TEMPLATES['job-posted-confirmation'];
  if (!entry) return;

  const datePosted = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const data = {
    jobId: args.jobId,
    jobTitle: args.jobTitle,
    clientName: args.clientName ?? 'there',
    datePosted,
  };
  const subjectLine =
    typeof entry.subject === 'function' ? entry.subject(data) : entry.subject;
  const html = await renderAsync(React.createElement(entry.component as any, data));

  const unsubToken = generateToken();
  await supabase
    .from('email_unsubscribe_tokens')
    .insert({ token: unsubToken, email: args.clientEmail.toLowerCase() })
    .select()
    .single()
    .then(({ error }) => {
      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        console.warn('[job-posted-email] token insert failed', error);
      }
    });

  const { error: enqErr } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      template_name: 'job-posted-confirmation',
      recipient_email: args.clientEmail,
      subject: subjectLine,
      html,
      from_name: FROM_DISPLAY,
      from_address: SUPPORT_ADDRESS,
      reply_to: SUPPORT_ADDRESS,
      sender_domain: SENDER_DOMAIN,
      idempotency_key: `job-posted-confirm-${args.jobId}`,
      unsubscribe_token: unsubToken,
      metadata: { job_id: args.jobId },
    },
  });
  if (enqErr) console.warn('[job-posted-email] enqueue failed', enqErr);
}
