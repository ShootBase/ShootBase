import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailHeader } from './_header'

interface Props {
  clientName?: string
  jobTitle?: string
  threadUrl?: string
}

const SITE = 'Shootbase'

const Email = ({
  clientName = 'Your client',
  jobTitle = 'their project',
  threadUrl = 'https://www.shootbase.co.uk/pro/dashboard',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Congratulations — you&apos;ve been hired for {jobTitle}</Preview>
    <Body style={main}>
      <Container style={container}>
        <EmailHeader />
        <Heading style={h1}>Congratulations — you&apos;ve been hired!</Heading>
        <Text style={text}>
          <strong>{clientName}</strong> confirmed they hired you for{' '}
          <strong>{jobTitle}</strong> on {SITE}. Great work.
        </Text>
        <Text style={text}>
          Reviews are the single biggest driver of new work. While the project
          is fresh, ask {clientName.split(' ')[0]} to leave you a review — it
          takes them under a minute and lifts your profile for every future
          enquiry.
        </Text>
        <Section style={{ margin: '28px 0' }}>
          <Button style={button} href={threadUrl}>
            Open the conversation
          </Button>
        </Section>
        <Text style={footer}>
          You&apos;re receiving this because a client confirmed you as their
          hire on {SITE}. Manage notifications from your account settings.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const title = (data?.jobTitle as string | undefined)?.trim()
    return title
      ? `Congratulations — you've been hired for "${title}"`
      : "Congratulations — you've been hired on Shootbase"
  },
  displayName: 'Hire confirmation',
  previewData: {
    clientName: 'Sarah Mills',
    jobTitle: 'Wedding photography in Manchester',
    threadUrl: 'https://www.shootbase.co.uk/threads/example',
  },
} satisfies TemplateEntry

export default Email

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1A1A1A', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#3a3a3a', lineHeight: '1.55', margin: '0 0 12px' }
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
