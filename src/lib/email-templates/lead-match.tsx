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
  Hr,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailHeader } from './_header'

interface LeadMatchProps {
  title?: string
  category?: string
  city?: string
  budget?: string
  summary?: string
  url?: string
  /** New: verification + privacy fields */
  maskedEmail?: string | null
  maskedPhone?: string | null
  clientVerified?: boolean
  clientPhoneVerified?: boolean
  memberSince?: string | null
  unlockCost?: number | null
  urgency?: string | null
}

const SITE = 'Shootbase'
const GOLD = '#C5A059'
const INK = '#1A1A1A'
const PANEL = '#FAFAF7'
const BORDER = '#ECECEC'

const Badge = ({ tone, children }: { tone: 'gold' | 'blue' | 'red' | 'ink'; children: React.ReactNode }) => {
  const toneMap: Record<string, { bg: string; fg: string; bd: string }> = {
    gold: { bg: '#FBF3DD', fg: '#8A6B1F', bd: '#E7CC7A' },
    blue: { bg: '#E8F1FB', fg: '#1D5BB5', bd: '#BFD4F0' },
    red: { bg: '#FDECEC', fg: '#B33A3A', bd: '#F2C7C7' },
    ink: { bg: '#F0EFEA', fg: INK, bd: '#DAD7CE' },
  }
  const t = toneMap[tone]
  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        padding: '3px 8px',
        borderRadius: '4px',
        marginRight: '6px',
      }}
    >
      {children}
    </span>
  )
}

const LeadMatchEmail = ({
  title = 'New project',
  category,
  city,
  budget,
  summary,
  url = 'https://www.shootbase.co.uk/pro/leads',
  maskedEmail,
  maskedPhone,
  clientVerified,
  clientPhoneVerified,
  memberSince,
  unlockCost,
  urgency,
}: LeadMatchProps) => {
  const isUrgent = urgency === 'asap' || urgency === '3-days'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${category ?? 'New'} project${city ? ` in ${city}` : ''} matches your profile`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <EmailHeader />

          {/* Accent bar */}
          <div style={{ height: '3px', backgroundColor: GOLD, margin: '0 0 20px' }} />

          <Heading style={h1}>A new project matches your profile</Heading>
          <Text style={text}>
            You've been matched to a fresh enquiry on {SITE}. Here's a preview — full contact
            details unlock with coins.
          </Text>

          <Section style={card}>
            <div style={{ marginBottom: '10px' }}>
              {isUrgent && <Badge tone="red">Urgent</Badge>}
              {category && <Badge tone="ink">{category}</Badge>}
              {city && <Badge tone="ink">{city}</Badge>}
            </div>

            <Text style={cardTitle}>{title}</Text>
            {budget && <Text style={meta}><strong>Budget:</strong> {budget}</Text>}
            {summary && <Text style={summaryText}>{summary}</Text>}

            <Hr style={hr} />

            <Text style={sectionLabel}>Client Trust</Text>
            <div style={{ marginBottom: '10px' }}>
              {clientVerified && <Badge tone="blue">✓ Email Verified</Badge>}
              {clientPhoneVerified && <Badge tone="gold">✓ Phone Verified</Badge>}
              {!clientVerified && !clientPhoneVerified && (
                <Badge tone="ink">New Client</Badge>
              )}
            </div>
            {memberSince && (
              <Text style={metaSmall}>
                Member since {memberSince}
              </Text>
            )}

            {(maskedEmail || maskedPhone) && (
              <>
                <Hr style={hr} />
                <Text style={sectionLabel}>Contact Preview</Text>
                {maskedEmail && (
                  <Text style={maskedRow}>
                    ✉ <span style={mono}>{maskedEmail}</span>
                  </Text>
                )}
                {maskedPhone && (
                  <Text style={maskedRow}>
                    ☎ <span style={mono}>{maskedPhone}</span>
                  </Text>
                )}
                <Text style={metaSmall}>Full details unlock after you respond.</Text>
              </>
            )}
          </Section>

          <Section style={{ margin: '24px 0', textAlign: 'center' as const }}>
            <Button style={button} href={url}>
              {unlockCost ? `View project · ${unlockCost} coins to unlock` : 'View project'}
            </Button>
          </Section>

          <Text style={footer}>
            You're receiving this because you have an active {SITE} pro account and this project
            matches your selected services and city. Manage notifications in your account settings.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: LeadMatchEmail,
  subject: (d: Record<string, any>) =>
    `New ${d.category || ''} project${d.city ? ` in ${d.city}` : ''}`.replace(/\s+/g, ' ').trim(),
  displayName: 'Project match notification',
  previewData: {
    title: 'Wedding photographer needed in May',
    category: 'Wedding Photography',
    city: 'Manchester',
    budget: '£1,000 – £2,500',
    summary: 'Looking for a wedding photographer for a 100-guest day at a country house.',
    url: 'https://www.shootbase.co.uk/pro/leads',
    maskedEmail: 'gi•••••@ex•••.co.uk',
    maskedPhone: '077•••••678',
    clientVerified: true,
    clientPhoneVerified: true,
    memberSince: 'Mar 2024',
    unlockCost: 10,
    urgency: '1-week',
  },
} satisfies TemplateEntry

export default LeadMatchEmail

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: INK, margin: '0 0 12px', letterSpacing: '-0.01em' }
const text = { fontSize: '15px', color: '#3a3a3a', lineHeight: '1.55', margin: '0 0 20px' }
const card = { border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '20px 22px', margin: '8px 0 0', backgroundColor: PANEL }
const cardTitle = { fontSize: '19px', fontWeight: 'bold' as const, color: INK, margin: '0 0 10px' }
const meta = { fontSize: '13px', color: '#3a3a3a', margin: '0 0 6px' }
const metaSmall = { fontSize: '12px', color: '#6B6B6B', margin: '4px 0 0' }
const summaryText = { fontSize: '14px', color: '#444', margin: '8px 0 0', lineHeight: '1.55' }
const sectionLabel = { fontSize: '10px', fontWeight: 'bold' as const, color: '#6B6B6B', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 8px' }
const hr = { borderColor: BORDER, margin: '16px 0' }
const maskedRow = { fontSize: '14px', color: INK, margin: '0 0 6px' }
const mono = { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', letterSpacing: '0.02em' }
const button = { backgroundColor: GOLD, color: '#ffffff', fontSize: '14px', fontWeight: 'bold' as const, borderRadius: '6px', padding: '13px 26px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: '#888888', margin: '28px 0 0', lineHeight: '1.5' }
