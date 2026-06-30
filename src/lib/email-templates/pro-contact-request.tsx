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

interface Props {
  clientName?: string
  jobTitle?: string
  jobCategory?: string
  city?: string
  eventDate?: string
  requestUrl?: string
}

const SITE = 'Shootbase'

const Email = ({
  jobTitle = 'a new project',
  jobCategory,
  city,
  requestUrl = 'https://www.shootbase.co.uk/pro/leads',
}: Props) => {
  const category = jobCategory || jobTitle
  const location = city || 'Location not specified'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>You've been requested for a new project on {SITE}</Preview>
      <Body style={main}>
        <Container style={container}>
          <EmailHeader />
          <Heading style={h1}>You've Been Requested</Heading>
          <Text style={text}>
            Great news! A client has specifically selected your profile for their project.
          </Text>
          <Section style={metaBox}>
            <Text style={metaLine}><strong>Job Type:</strong> {category}</Text>
            <Text style={metaLine}><strong>Location:</strong> {location}</Text>
          </Section>
          <Text style={text}>
            Your experience and portfolio matched what the client is looking for.
          </Text>
          <Text style={text}>
            Review the project details and decide whether you'd like to unlock the project and start the conversation.
          </Text>
          <Text style={textMuted}>
            Client details will remain protected until the project is unlocked.
          </Text>
          <Section style={{ margin: '28px 0' }}>
            <Button style={button} href={requestUrl}>
              Review Project
            </Button>
          </Section>
          <Text style={footer}>
            —<br />The {SITE} Team
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: () => "You've Been Requested for a New Project",
  displayName: 'You\'ve been requested',
  previewData: {
    clientName: 'Sarah',
    jobTitle: 'Wedding photography in Manchester',
    jobCategory: 'Wedding Photography',
    city: 'Manchester',
    eventDate: '2026-08-14',
    requestUrl: 'https://www.shootbase.co.uk/pro/leads?job=example',
  },
} satisfies TemplateEntry

export default Email

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1A1A1A', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#3a3a3a', lineHeight: '1.55', margin: '0 0 12px' }
const textMuted = { fontSize: '13px', color: '#6b6b6b', lineHeight: '1.5', margin: '0 0 12px', fontStyle: 'italic' as const }
const metaBox = {
  borderLeft: '3px solid #C5A059',
  backgroundColor: '#FAF7F1',
  padding: '12px 16px',
  margin: '12px 0',
}
const metaLine = { fontSize: '14px', color: '#1A1A1A', margin: '4px 0', lineHeight: '1.5' }
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
