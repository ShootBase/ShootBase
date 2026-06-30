// Generates a Shootbase credit-purchase PDF receipt, uploads to storage,
// and enqueues the receipt email. Service-role only — call from the
// payments webhook after credits have been granted.

import * as React from 'react'
import { render as renderAsync } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { generateCreditReceiptPdf, creditReceiptFilename } from '@/lib/credit-receipt-pdf'

const SITE_NAME = 'Shootbase'
const SENDER_DOMAIN = 'notify.shootbase.co.uk'
const FROM_DOMAIN = 'shootbase.co.uk'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type SendCreditReceiptArgs = {
  userId: string
  credits: number
  packageName: string
  amountPence: number
  stripePaymentId: string
}

export async function sendCreditReceipt(args: SendCreditReceiptArgs): Promise<{ ok: boolean; reason?: string }> {
  const { userId, credits, packageName, amountPence, stripePaymentId } = args
  if (!amountPence || amountPence <= 0) return { ok: false, reason: 'no_amount' }

  const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return { ok: false, reason: 'missing_env' }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Resolve customer email + name
  const { data: userRes } = await supabase.auth.admin.getUserById(userId)
  const recipient = userRes?.user?.email?.trim()
  if (!recipient) return { ok: false, reason: 'no_email' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle()
  const customerName = (profile?.full_name as string | null | undefined)?.trim()
    || (userRes?.user?.user_metadata?.full_name as string | undefined)
    || recipient.split('@')[0]

  // Suppression check
  const { data: suppressed } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', recipient.toLowerCase())
    .maybeSingle()
  if (suppressed) return { ok: false, reason: 'suppressed' }

  // Stable receipt number derived from the Stripe payment id
  const receiptNumber = `SB-${stripePaymentId.slice(-10).toUpperCase()}`
  const purchaseDate = new Date().toISOString().slice(0, 10)

  // Generate + upload PDF
  let receiptUrl: string | undefined
  try {
    const pdfBytes = await generateCreditReceiptPdf({
      receiptNumber,
      customerName,
      customerEmail: recipient,
      purchaseDate,
      packageName,
      credits,
      amountPence,
      stripePaymentId,
    })
    const path = `credit-receipts/${userId}/${creditReceiptFilename(receiptNumber)}`
    const { error: uploadErr } = await supabase.storage
      .from('invoice-pdfs')
      .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true })
    if (!uploadErr) {
      const { data: signed } = await supabase.storage
        .from('invoice-pdfs')
        .createSignedUrl(path, 60 * 60 * 24 * 365)
      receiptUrl = signed?.signedUrl
    } else {
      console.error('[credit-receipt] PDF upload failed', uploadErr)
    }
  } catch (e) {
    console.error('[credit-receipt] PDF generation failed', e)
  }

  // Unsubscribe token (transactional emails still include the footer)
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
      .upsert({ token: unsubToken, email: recipient.toLowerCase() }, { onConflict: 'email', ignoreDuplicates: true })
    const { data: stored } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', recipient.toLowerCase())
      .maybeSingle()
    unsubToken = (stored as { token?: string } | null)?.token ?? unsubToken
  }

  const template = TEMPLATES['credit-receipt']
  const templateData = {
    receiptNumber,
    customerName,
    customerEmail: recipient,
    purchaseDate,
    packageName,
    credits,
    amountPence,
    stripePaymentId,
    receiptUrl,
  }
  const element = React.createElement(template.component, templateData)
  const html = await renderAsync(element)
  const plainText = await renderAsync(element, { plainText: true })
  const subject = typeof template.subject === 'function' ? template.subject(templateData) : template.subject

  const outboundMessageId = crypto.randomUUID()
  const idempotencyKey = `credit-receipt-${stripePaymentId}`

  await supabase.from('email_send_log').insert({
    message_id: outboundMessageId,
    template_name: 'credit-receipt',
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
      label: 'credit-receipt',
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubToken,
      queued_at: new Date().toISOString(),
    },
  })
  if (enqueueError) {
    console.error('[credit-receipt] enqueue failed', enqueueError)
    return { ok: false, reason: 'enqueue_failed' }
  }
  return { ok: true }
}
