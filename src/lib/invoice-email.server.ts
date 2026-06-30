// Renders and enqueues the "invoice" transactional email using pgmq.
// Kept in a .server.ts file so React Email rendering + service-role admin
// client never leak into the client bundle.

import * as React from 'react'
import { render as renderAsync } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { TEMPLATES } from '@/lib/email-templates/registry'
import type { Invoice } from '@/lib/invoices.functions'

const SITE_NAME = 'Shootbase'
const SENDER_DOMAIN = 'notify.shootbase.co.uk'
const FROM_DOMAIN = 'shootbase.co.uk'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function enqueueInvoiceEmail(args: {
  invoice: Invoice
  fromName: string
  branding?: {
    businessName: string | null
    logoUrl: string | null
    brandColor: string | null
  } | null
}): Promise<{ ok: boolean; reason?: string }> {
  const { invoice, fromName, branding } = args
  const recipient = invoice.client_email?.trim()
  if (!recipient) return { ok: false, reason: 'missing_client_email' }

  const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return { ok: false, reason: 'missing_env' }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Suppression check
  const { data: suppressed } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', recipient.toLowerCase())
    .maybeSingle()
  if (suppressed) return { ok: false, reason: 'suppressed' }

  // Unsubscribe token
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
    return { ok: false, reason: 'unsubscribed' }
  }

  // Generate PDF, upload to storage, and produce a long-lived signed URL.
  let invoiceUrl: string | undefined
  try {
    const { generateInvoicePdf, invoicePdfFilename } = await import('@/lib/invoice-pdf')
    const pdfBytes = await generateInvoicePdf({ invoice, fromName, branding })
    const path = `${invoice.user_id}/${invoice.id}/${invoicePdfFilename(invoice)}`
    const { error: uploadErr } = await supabase.storage
      .from('invoice-pdfs')
      .upload(path, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })
    if (!uploadErr) {
      const { data: signed } = await supabase.storage
        .from('invoice-pdfs')
        .createSignedUrl(path, 60 * 60 * 24 * 30)
      invoiceUrl = signed?.signedUrl
    } else {
      console.error('[invoice-email] PDF upload failed', uploadErr)
    }
  } catch (e) {
    console.error('[invoice-email] PDF generation failed', e)
  }

  const template = TEMPLATES['invoice']
  const templateData = {
    invoiceNumber: invoice.invoice_number,
    clientName: invoice.client_name,
    fromName,
    invoiceDate: invoice.invoice_date,
    dueDate: invoice.due_date,
    projectDescription: invoice.project_description,
    lineItems: invoice.line_items,
    subtotalPence: invoice.subtotal_pence,
    taxPence: invoice.tax_pence,
    totalPence: invoice.total_pence,
    taxRate: invoice.tax_rate,
    taxEnabled: invoice.tax_enabled,
    notes: invoice.notes,
    invoiceUrl,
    bankDetails: invoice.bank_details,
    paymentLinks: invoice.payment_links,
    showBankDetails: invoice.show_bank_details,
    showPaymentLinks: invoice.show_payment_links,
    logoUrl: branding?.logoUrl ?? null,
    businessName: branding?.businessName ?? fromName,
  }
  const element = React.createElement(template.component, templateData)
  const html = await renderAsync(element)
  const plainText = await renderAsync(element, { plainText: true })
  const subject =
    typeof template.subject === 'function' ? template.subject(templateData) : template.subject

  const outboundMessageId = crypto.randomUUID()
  const idempotencyKey = `invoice-${invoice.id}-${invoice.updated_at}`

  await supabase.from('email_send_log').insert({
    message_id: outboundMessageId,
    template_name: 'invoice',
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
      label: 'invoice',
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubToken,
      queued_at: new Date().toISOString(),
    },
  })
  if (enqueueError) {
    console.error('[invoice-email] enqueue failed', enqueueError)
    await supabase.from('email_send_log').insert({
      message_id: outboundMessageId,
      template_name: 'invoice',
      recipient_email: recipient,
      status: 'failed',
      error_message: 'Failed to enqueue',
    })
    return { ok: false, reason: 'enqueue_failed' }
  }
  return { ok: true }
}
