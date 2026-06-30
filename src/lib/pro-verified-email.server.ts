// Sends a confirmation email when a Professional has fully verified their
// account (email + mobile phone). Enqueued via the shared app-email queue.

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

export async function sendProVerifiedEmail(args: {
  userId: string;
  proEmail: string;
  proName: string | null;
}): Promise<void> {
  if (!args.proEmail || !args.proEmail.includes('@')) return;

  const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.warn('[pro-verified-email] missing env, skipping');
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const entry = TEMPLATES['pro-verified'];
  if (!entry) return;

  const data = { proName: args.proName ?? 'there' };
  const subjectLine =
    typeof entry.subject === 'function' ? entry.subject(data) : entry.subject;
  const html = await renderAsync(React.createElement(entry.component as any, data));

  const unsubToken = generateToken();
  await supabase
    .from('email_unsubscribe_tokens')
    .insert({ token: unsubToken, email: args.proEmail.toLowerCase() })
    .select()
    .single()
    .then(({ error }) => {
      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        console.warn('[pro-verified-email] token insert failed', error);
      }
    });

  const { error: enqErr } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      template_name: 'pro-verified',
      recipient_email: args.proEmail,
      subject: subjectLine,
      html,
      from_name: FROM_DISPLAY,
      from_address: SUPPORT_ADDRESS,
      reply_to: SUPPORT_ADDRESS,
      sender_domain: SENDER_DOMAIN,
      idempotency_key: `pro-verified-${args.userId}`,
      unsubscribe_token: unsubToken,
      metadata: { user_id: args.userId },
    },
  });
  if (enqErr) console.warn('[pro-verified-email] enqueue failed', enqErr);
}
