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

interface DigestLead {
  title: string
  category?: string
  city?: string
  budget?: string
  url: string
}

interface LeadDigestProps {
  mode?: 'daily' | 'weekly'
  leads?: DigestLead[]
  url?: string
}

const SITE = 'Shootbase'

const LeadDigestEmail = ({
  mode = 'daily',
  leads = [],
  url = 'https://www.shootbase.co.uk/pro/leads',
}: LeadDigestProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Your ${mode} ${SITE} project digest — ${leads.length} new match${leads.length === 1 ? '' : 'es'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <EmailHeader />
        <Heading style={h1}>Your {mode} project digest</Heading>
        <Text style={text}>
          {leads.length === 0
            ? `No new matching projects this ${mode === 'daily' ? 'day' : 'week'}.`
            : `${leads.length} new project${leads.length === 1 ? '' : 's'} matched your profile.`}
        </Text>

        {leads.map((l, i) => (
          <Section key={i} style={card}>
            <Text style={cardTitle}>{l.title}</Text>
            {l.category && <Text style={meta}><strong>Category:</strong> {l.category}</Text>}
            {l.city && <Text style={meta}><strong>Location:</strong> {l.city}</Text>}
            {l.budget && <Text style={meta}><strong>Budget:</strong> {l.budget}</Text>}
            <Section style={{ marginTop: 10 }}>
              <Button style={smallButton} href={l.url}>View project</Button>
            </Section>
          </Section>
        ))}

        <Section style={{ margin: '24px 0' }}>
          <Button style={button} href={url}>Open projects marketplace</Button>
        </Section>

        <Text style={footer}>
          You chose a {mode} digest. Change your notification preferences in your account
          settings on {SITE}.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: LeadDigestEmail,
  subject: (d: Record<string, any>) =>
    `Your ${d.mode === 'weekly' ? 'weekly' : 'daily'} Shootbase project digest`,
  displayName: 'Project digest',
  previewData: {
    mode: 'daily',
    leads: [
      { title: 'Wedding photographer needed', category: 'Wedding', city: 'Leeds', budget: '£1,000+', url: 'https://www.shootbase.co.uk/pro/leads' },
    ],
    url: 'https://www.shootbase.co.uk/pro/leads',
  },
} satisfies TemplateEntry

export default LeadDigestEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1A1A1A', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#3a3a3a', lineHeight: '1.55', margin: '0 0 16px' }
const card = {
  border: '1px solid #ECECEC',
  padding: '14px 18px',
  margin: '10px 0',
  backgroundColor: '#FAFAF7',
}
const cardTitle = { fontSize: '16px', fontWeight: 'bold' as const, color: '#1A1A1A', margin: '0 0 8px' }
const meta = { fontSize: '13px', color: '#3a3a3a', margin: '0 0 4px' }
const button = {
  backgroundColor: '#C5A059',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '4px',
  padding: '12px 22px',
  textDecoration: 'none',
}
const smallButton = {
  backgroundColor: '#1A1A1A',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: 'bold' as const,
  borderRadius: '4px',
  padding: '8px 14px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#888888', margin: '28px 0 0', lineHeight: '1.5' }
