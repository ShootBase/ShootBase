import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailHeader } from './_header'

interface NewMessageProps {
  recipientRole?: 'client' | 'professional'
  threadUrl?: string
  senderName?: string
  jobTitle?: string
  messagePreview?: string
  sentAt?: string
  preview?: string
}

const SITE = 'Shootbase'

function formatSentAt(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  })
}

const NewMessageEmail = ({
  recipientRole = 'client',
  threadUrl = 'https://www.shootbase.co.uk/dashboard',
  senderName,
  jobTitle,
  messagePreview,
  sentAt,
  preview,
}: NewMessageProps) => {
  const sender =
    senderName ||
    (recipientRole === 'professional' ? 'Your client' : 'A professional on Shootbase')
  const job = jobTitle || 'your request'
  const ts = formatSentAt(sentAt)
  const previewText =
    preview || messagePreview || `New message regarding ${job}`

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <EmailHeader />
          <Heading style={h1}>New message regarding your request</Heading>
          <Text style={text}>
            <strong>{sender}</strong> sent you a message about{' '}
            <strong>{job}</strong>.
          </Text>
          {ts ? <Text style={meta}>Sent {ts}</Text> : null}
          {messagePreview ? (
            <Section style={quoteWrap}>
              <Text style={quote}>“{messagePreview}”</Text>
            </Section>
          ) : null}
          <Section style={{ margin: '28px 0' }}>
            <Button style={button} href={threadUrl}>
              View Message
            </Button>
          </Section>
          <Text style={footer}>
            You're receiving this because you have an account on {SITE}. Manage
            your notification preferences from your account settings.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: NewMessageEmail,
  subject: (data: Record<string, any>) => {
    const role = data?.recipientRole as 'client' | 'professional' | undefined
    if (role === 'client') return 'A professional has responded to your job'
    if (role === 'professional') return 'Your client has replied'
    const title = (data?.jobTitle as string | undefined)?.trim()
    return title
      ? `New message regarding "${title}"`
      : 'New message regarding your request'
  },

  displayName: 'New message notification',
  previewData: {
    recipientRole: 'client',
    threadUrl: 'https://www.shootbase.co.uk/threads/example',
    senderName: 'Aperture Studio',
    jobTitle: 'Wedding photography in Manchester',
    messagePreview:
      "Hi! I'd love to discuss your wedding shoot. I have availability on the date and a few package options to share.",
    sentAt: new Date().toISOString(),
  },
} satisfies TemplateEntry

export default NewMessageEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#1A1A1A',
  margin: '0 0 16px',
}
const text = {
  fontSize: '15px',
  color: '#3a3a3a',
  lineHeight: '1.55',
  margin: '0 0 12px',
}
const meta = {
  fontSize: '12px',
  color: '#888888',
  margin: '0 0 16px',
}
const quoteWrap = {
  borderLeft: '3px solid #C5A059',
  backgroundColor: '#FAF7F1',
  padding: '12px 16px',
  margin: '8px 0 4px',
}
const quote = {
  fontSize: '15px',
  color: '#1A1A1A',
  fontStyle: 'italic' as const,
  lineHeight: '1.55',
  margin: '0',
}
const button = {
  backgroundColor: '#C5A059',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '4px',
  padding: '12px 22px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#888888', margin: '28px 0 0', lineHeight: '1.5' }
