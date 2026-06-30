import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailHeader } from './_header'

interface Props {
  clientName?: string
  jobId?: string
  jobTitle?: string
  datePosted?: string
}

const Email = ({
  clientName = 'there',
  jobId = '',
  jobTitle = 'your project',
  datePosted = '',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your job has been posted on ShootBase</Preview>
    <Body style={main}>
      <Container style={container}>
        <EmailHeader />
        <Heading style={h1}>Your job has been posted</Heading>
        <Text style={text}>Hello {clientName},</Text>
        <Text style={text}>
          Your job has been successfully posted on ShootBase.
        </Text>
        <Section style={{ margin: '20px 0' }}>
          <Text style={meta}><strong>Job ID:</strong> {jobId}</Text>
          <Text style={meta}><strong>Job Title:</strong> {jobTitle}</Text>
          <Text style={meta}><strong>Date Posted:</strong> {datePosted}</Text>
        </Section>
        <Text style={text}>
          Professionals can now view your job and respond if interested.
        </Text>
        <Text style={text}>Regards,<br />ShootBase Support</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Your job has been posted — ShootBase',
  displayName: 'Job posted confirmation',
  previewData: {
    clientName: 'Sarah',
    jobId: '12345',
    jobTitle: 'Wedding photography in Manchester',
    datePosted: '26 Jun 2026, 14:32',
  },
} satisfies TemplateEntry

export default Email

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1A1A1A', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#3a3a3a', lineHeight: '1.55', margin: '0 0 12px' }
const meta = { fontSize: '14px', color: '#1A1A1A', margin: '4px 0' }
