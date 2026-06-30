// Enqueues a "new-message" transactional email using the same pgmq
// pattern as lead-notifications-dispatch. Kept in a .server.ts file so
// React Email rendering + service-role admin client never leak to the
// client bundle.

import * as React from 'react'
import { render as renderAsync } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'Shootbase'
const SENDER_DOMAIN = 'notify.shootbase.co.uk'
const FROM_DOMAIN = 'shootbase.co.uk'
const APP_BASE = 'https://www.shootbase.co.uk'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface EnqueueNewMessageArgs {
  qrId: string
  messageId: string
  senderUserId: string
  body: string
}

export async function enqueueNewMessageEmail(args: EnqueueNewMessageArgs): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.warn('[new-message-email] missing env, skipping')
    return
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Resolve the conversation: who's the recipient, what's the job title
  const { data: qr, error: qrErr } = await supabase
    .from('quote_requests')
    .select('id, customer_id, professional_id, job:jobs(title), professional:professionals(user_id, business_name, contact_name)')
    .eq('id', args.qrId)
    .maybeSingle()
  if (qrErr || !qr) {
    console.warn('[new-message-email] qr lookup failed', qrErr)
    return
  }
  const q = qr as any

  const senderIsClient = q.customer_id === args.senderUserId
  const recipientUserId: string | null = senderIsClient
    ? q.professional?.user_id ?? null
    : q.customer_id
  if (!recipientUserId) return
  const recipientRole: 'client' | 'professional' = senderIsClient ? 'professional' : 'client'

  // Resolve recipient email via auth admin
  const { data: au } = await supabase.auth.admin.getUserById(recipientUserId)
  const recipient = au?.user?.email
  if (!recipient) return

  // Suppression check
  const { data: suppressed } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', recipient.toLowerCase())
    .maybeSingle()
  if (suppressed) return

  // Sender display name
  let senderName: string | undefined
  if (senderIsClient) {
    const { data: cust } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', args.senderUserId)
      .maybeSingle()
    senderName = (cust as any)?.full_name ?? undefined
  } else {
    senderName =
      (q.professional?.business_name as string | undefined) ||
      (q.professional?.contact_name as string | undefined) ||
      undefined
  }

  const jobTitle = (q.job?.title as string | undefined) ?? 'your request'
  const threadUrl = `${APP_BASE}/threads/${args.qrId}`
  const messagePreview = args.body.slice(0, 240)

  // Unsubscribe token (get or create)
  let unsubToken: string | null = null
  const { data: tokenRow } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', recipient.toLowerCase())
    .maybeSingle()
  if (tokenRow?.token && !tokenRow.used_at) {
    unsubToken = tokenRow.token
  } else if (!tokenRow) {
    unsubToken = generateToken()
    await supabase
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubToken, email: recipient.toLowerCase() },
        { onConflict: 'email', ignoreDuplicates: true },
      )
    const { data: stored } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', recipient.toLowerCase())
      .maybeSingle()
    unsubToken = (stored as any)?.token ?? unsubToken
  } else {
    return // already unsubscribed
  }

  const template = TEMPLATES['new-message']
  const templateData = {
    recipientRole,
    threadUrl,
    senderName,
    jobTitle,
    messagePreview,
    sentAt: new Date().toISOString(),
  }
  const element = React.createElement(template.component, templateData)
  const html = await renderAsync(element)
  const plainText = await renderAsync(element, { plainText: true })
  const subject =
    typeof template.subject === 'function' ? template.subject(templateData) : template.subject

  const outboundMessageId = crypto.randomUUID()
  const idempotencyKey = `new-message-${args.messageId}`

  await supabase.from('email_send_log').insert({
    message_id: outboundMessageId,
    template_name: 'new-message',
    recipient_email: recipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: outboundMessageId,
      to: recipient,
      from: `Shootbase Support <support@${FROM_DOMAIN}>`,
      reply_to: `support@${FROM_DOMAIN}`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text: plainText,
      purpose: 'transactional',
      label: 'new-message',
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubToken,
      queued_at: new Date().toISOString(),
    },
  })
  if (enqueueError) {
    console.error('[new-message-email] enqueue failed', enqueueError)
    await supabase.from('email_send_log').insert({
      message_id: outboundMessageId,
      template_name: 'new-message',
      recipient_email: recipient,
      status: 'failed',
      error_message: 'Failed to enqueue',
    })
  }
}
