// Dispatches pending project-match notifications by rendering the project-match
// template and enqueuing pre-rendered emails into the transactional_emails
// pgmq queue (the same shape /lovable/email/transactional/send uses), so the
// existing queue processor handles delivery, retries, and rate limiting.
//
// Auth: anon apikey header (Lovable Cloud pattern). The route bypasses the
// edge auth wall but does its own caller check.

import * as React from 'react'
import { render as renderAsync } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'Shootbase'
const SENDER_DOMAIN = 'notify.shootbase.co.uk'
const FROM_DOMAIN = 'shootbase.co.uk'
const APP_BASE = 'https://www.shootbase.co.uk'
const MAX_BATCH = 50

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const Route = createFileRoute('/api/public/hooks/lead-notifications-dispatch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const cronSecret = process.env.CRON_SECRET

        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: 'Server misconfigured' }, { status: 500 })
        }
        const callerSecret =
          request.headers.get('x-cron-secret') ??
          (request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '')
        if (!cronSecret || callerSecret.length === 0 || callerSecret !== cronSecret) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })

        // Pull pending matches with the data we need to render.
        // Priority: subscribers (active/trialing) get notified first;
        // non-subscribers are held until they are at least NON_SUB_DELAY_MIN minutes old.
        const NON_SUB_DELAY_MIN = 15
        const cutoffIso = new Date(Date.now() - NON_SUB_DELAY_MIN * 60_000).toISOString()

        const { data: pending, error: pendErr } = await supabase
          .from('lead_match_notifications')
          .select(
            'id, job_id, professional_id, created_at, jobs:job_id(id,title,city,budget_band,summary,event_date,urgency,unlock_credit_cost,customer_id,contact_phone,service:services(name)), professionals:professional_id(user_id)'
          )
          .eq('email_status', 'pending')
          .order('created_at', { ascending: true })
          .limit(MAX_BATCH * 2)

        if (pendErr) {
          console.error('project-notif dispatch query failed', pendErr)
          return Response.json({ error: 'Query failed' }, { status: 500 })
        }
        if (!pending || pending.length === 0) {
          return Response.json({ ok: true, processed: 0 })
        }

        // Determine active subscribers among this batch's pro user_ids
        const userIds = Array.from(new Set((pending as any[]).map((r) => r.professionals?.user_id).filter(Boolean)))
        const { data: subs } = userIds.length
          ? await supabase
              .from('subscriptions')
              .select('user_id,status')
              .in('user_id', userIds)
              .in('status', ['active', 'trialing'])
          : { data: [] as any[] }
        const subscriberSet = new Set((subs ?? []).map((s: any) => s.user_id))

        // Sort: subscribers first; then by created_at. Skip non-subscribers younger than cutoff.
        const queue = (pending as any[])
          .filter((r) => {
            const isSub = subscriberSet.has(r.professionals?.user_id)
            if (isSub) return true
            return r.created_at && r.created_at <= cutoffIso
          })
          .sort((a, b) => {
            const aSub = subscriberSet.has(a.professionals?.user_id) ? 0 : 1
            const bSub = subscriberSet.has(b.professionals?.user_id) ? 0 : 1
            if (aSub !== bSub) return aSub - bSub
            return String(a.created_at).localeCompare(String(b.created_at))
          })
          .slice(0, MAX_BATCH)

        if (queue.length === 0) {
          return Response.json({ ok: true, processed: 0, deferred: pending.length })
        }


        const template = TEMPLATES['lead-match']
        let processed = 0
        let failed = 0

        for (const row of queue as any[]) {
          const job = row.jobs
          const pro = row.professionals
          if (!job || !pro?.user_id) {
            await supabase
              .from('lead_match_notifications')
              .update({ email_status: 'failed' })
              .eq('id', row.id)
            failed++
            continue
          }

          // Resolve recipient + re-check suppression
          const { data: userRow } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', pro.user_id)
            .maybeSingle()
          void userRow
          const { data: au } = await supabase.auth.admin.getUserById(pro.user_id)
          const recipient = au?.user?.email
          if (!recipient) {
            await supabase
              .from('lead_match_notifications')
              .update({ email_status: 'failed' })
              .eq('id', row.id)
            failed++
            continue
          }

          const { data: suppressed } = await supabase
            .from('suppressed_emails')
            .select('id')
            .eq('email', recipient.toLowerCase())
            .maybeSingle()
          if (suppressed) {
            await supabase
              .from('lead_match_notifications')
              .update({ email_status: 'skipped_suppressed' })
              .eq('id', row.id)
            continue
          }

          // Get/create unsubscribe token
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
                { onConflict: 'email', ignoreDuplicates: true }
              )
            const { data: stored } = await supabase
              .from('email_unsubscribe_tokens')
              .select('token')
              .eq('email', recipient.toLowerCase())
              .maybeSingle()
            unsubToken = stored?.token ?? unsubToken
          } else {
            await supabase
              .from('lead_match_notifications')
              .update({ email_status: 'skipped_suppressed' })
              .eq('id', row.id)
            continue
          }

          // Lookup customer profile for verification + member-since signals
          let clientVerified = false
          let clientPhoneVerified = false
          let memberSince: string | null = null
          let maskedEmail: string | null = null
          let maskedPhone: string | null = null
          if (job.customer_id) {
            const { data: cp } = await supabase
              .from('profiles')
              .select('verified, verified_phone, phone')
              .eq('id', job.customer_id)
              .maybeSingle()
            clientVerified = !!(cp as any)?.verified
            clientPhoneVerified = !!(cp as any)?.verified_phone
            const { data: cu } = await supabase.auth.admin.getUserById(job.customer_id)
            const cEmail = cu?.user?.email ?? null
            memberSince = cu?.user?.created_at
              ? new Date(cu.user.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
              : null
            if (cEmail) {
              const at = cEmail.indexOf('@')
              const local = cEmail.slice(0, at)
              const dom = cEmail.slice(at + 1)
              const dot = dom.indexOf('.')
              const name = dot === -1 ? dom : dom.slice(0, dot)
              const tld = dot === -1 ? '' : dom.slice(dot)
              maskedEmail = `${local.slice(0, Math.min(2, local.length))}•••••@${name.slice(0, Math.min(2, name.length))}•••${tld}`
            }
            const rawPhone: string | null = (job as any).contact_phone ?? (cp as any)?.phone ?? null
            if (rawPhone) {
              const d = rawPhone.replace(/\D/g, '')
              maskedPhone = d.length >= 6 ? `${d.slice(0, 3)}•••••${d.slice(-3)}` : '•••'
            }
          }

          const templateData = {
            title: job.title,
            category: job.service?.name ?? undefined,
            city: job.city,
            budget: job.budget_band ?? undefined,
            summary: job.summary ?? undefined,
            url: `${APP_BASE}/pro/leads?job=${job.id}`,
            urgency: (job as any).urgency ?? null,
            unlockCost: (job as any).unlock_credit_cost ?? null,
            maskedEmail,
            maskedPhone,
            clientVerified,
            clientPhoneVerified,
            memberSince,
          }

          const messageId = crypto.randomUUID()
          const idempotencyKey = `project-match-${job.id}-${row.professional_id}`
          const element = React.createElement(template.component, templateData)
          const html = await renderAsync(element)
          const plainText = await renderAsync(element, { plainText: true })
          const subject =
            typeof template.subject === 'function' ? template.subject(templateData) : template.subject

          // Log pending in email_send_log
          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: 'lead-match',
            recipient_email: recipient,
            status: 'pending',
          })

          const { error: enqueueError } = await supabase.rpc('enqueue_email', {
            queue_name: 'transactional_emails',
            payload: {
              message_id: messageId,
              to: recipient,
              from: `Shootbase Support <support@${FROM_DOMAIN}>`,
              reply_to: `support@${FROM_DOMAIN}`,
              sender_domain: SENDER_DOMAIN,
              subject,
              html,
              text: plainText,
              purpose: 'transactional',
              label: 'lead-match',
              idempotency_key: idempotencyKey,
              unsubscribe_token: unsubToken,
              queued_at: new Date().toISOString(),
            },
          })

          if (enqueueError) {
            console.error('enqueue failed', enqueueError)
            await supabase.from('email_send_log').insert({
              message_id: messageId,
              template_name: 'lead-match',
              recipient_email: recipient,
              status: 'failed',
              error_message: 'Failed to enqueue',
            })
            await supabase
              .from('lead_match_notifications')
              .update({ email_status: 'failed', email_message_id: messageId })
              .eq('id', row.id)
            failed++
            continue
          }

          await supabase
            .from('lead_match_notifications')
            .update({
              email_status: 'queued',
              email_message_id: messageId,
              email_sent_at: new Date().toISOString(),
            })
            .eq('id', row.id)
          processed++
        }

        return Response.json({ ok: true, processed, failed })
      },
    },
  },
})
