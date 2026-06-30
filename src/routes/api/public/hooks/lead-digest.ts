// Digest sender. Cron calls this with { mode: 'daily' | 'weekly' }.
// Aggregates deferred lead_match_notifications per pro, renders the
// project-digest template, enqueues one digest email per pro, then marks all
// included rows as digest_sent and bumps last_digest_sent_at.

import * as React from 'react'
import { render as renderAsync } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
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

export const Route = createFileRoute('/api/public/hooks/lead-digest')({
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

        let mode: 'daily' | 'weekly' = 'daily'
        try {
          const body = await request.json()
          if (body?.mode === 'weekly') mode = 'weekly'
        } catch {}

        const supabase = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })

        // Pros eligible for this digest
        const { data: prefs, error: prefErr } = await supabase
          .from('pro_notification_prefs')
          .select('professional_id, last_digest_sent_at')
          .eq('lead_email_mode', mode)
        if (prefErr) {
          console.error('digest pref query failed', prefErr)
          return Response.json({ error: 'Query failed' }, { status: 500 })
        }
        if (!prefs || prefs.length === 0) {
          return Response.json({ ok: true, sent: 0 })
        }

        const template = TEMPLATES['lead-digest']
        const lookback = mode === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
        let sent = 0

        for (const pref of prefs) {
          const since = pref.last_digest_sent_at ?? new Date(Date.now() - lookback).toISOString()

          const { data: rows } = await supabase
            .from('lead_match_notifications')
            .select(
              'id, job_id, jobs:job_id(id,title,city,budget_band,status,expires_at,service:services(name))'
            )
            .eq('professional_id', pref.professional_id)
            .eq('email_status', 'deferred')
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(20)

          const leads = ((rows ?? []) as any[])
            .filter((r) => r.jobs && r.jobs.status === 'open' && new Date(r.jobs.expires_at) > new Date())
            .map((r) => ({
              title: r.jobs.title as string,
              category: r.jobs.service?.name ?? undefined,
              city: r.jobs.city as string | undefined,
              budget: r.jobs.budget_band ?? undefined,
              url: `${APP_BASE}/pro/leads?job=${r.jobs.id}`,
            }))

          if (leads.length === 0) {
            await supabase
              .from('pro_notification_prefs')
              .update({ last_digest_sent_at: new Date().toISOString() })
              .eq('professional_id', pref.professional_id)
            continue
          }

          // Recipient
          const { data: pro } = await supabase
            .from('professionals')
            .select('user_id')
            .eq('id', pref.professional_id)
            .maybeSingle()
          if (!pro?.user_id) continue
          const { data: au } = await supabase.auth.admin.getUserById(pro.user_id)
          const recipient = au?.user?.email
          if (!recipient) continue

          // Suppression
          const { data: suppressed } = await supabase
            .from('suppressed_emails')
            .select('id')
            .eq('email', recipient.toLowerCase())
            .maybeSingle()
          if (suppressed) {
            await supabase
              .from('pro_notification_prefs')
              .update({ last_digest_sent_at: new Date().toISOString() })
              .eq('professional_id', pref.professional_id)
            continue
          }

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
                { onConflict: 'email', ignoreDuplicates: true }
              )
          } else {
            continue
          }

          const templateData = { mode, leads, url: `${APP_BASE}/pro/leads` }
          const messageId = crypto.randomUUID()
          const idempotencyKey = `project-digest-${mode}-${pref.professional_id}-${new Date().toISOString().slice(0, 10)}`
          const element = React.createElement(template.component, templateData)
          const html = await renderAsync(element)
          const plainText = await renderAsync(element, { plainText: true })
          const subject =
            typeof template.subject === 'function' ? template.subject(templateData) : template.subject

          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: 'lead-digest',
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
              label: 'lead-digest',
              idempotency_key: idempotencyKey,
              unsubscribe_token: unsubToken,
              queued_at: new Date().toISOString(),
            },
          })
          if (enqueueError) {
            console.error('digest enqueue failed', enqueueError)
            continue
          }

          // Mark all included rows as digest_sent + bump last digest
          const ids = (rows ?? []).map((r: any) => r.id)
          if (ids.length > 0) {
            await supabase
              .from('lead_match_notifications')
              .update({ email_status: 'digest_sent', email_message_id: messageId, email_sent_at: new Date().toISOString() })
              .in('id', ids)
          }
          await supabase
            .from('pro_notification_prefs')
            .update({ last_digest_sent_at: new Date().toISOString() })
            .eq('professional_id', pref.professional_id)
          sent++
        }

        return Response.json({ ok: true, sent })
      },
    },
  },
})
