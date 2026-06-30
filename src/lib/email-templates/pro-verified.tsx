import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailHeader } from './_header'

interface Props {
  proName?: string
}

const Email = ({ proName = 'there' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your ShootBase account is verified</Preview>
    <Body style={main}>
      <Container style={container}>
        <EmailHeader />
        <Heading style={h1}>Your ShootBase account is verified</Heading>
        <Text style={text}>Hello {proName},</Text>
        <Text style={text}>
          Your email address and mobile number have been verified successfully.
        </Text>
        <Text style={text}>
          You can now access projects, respond to clients, and use ShootBase as a verified Professional.
        </Text>
        <Text style={text}>Regards,<br />ShootBase Support</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Your ShootBase account is verified',
  displayName: 'Pro account verified',
  previewData: { proName: 'Alex' },
} satisfies TemplateEntry

export default Email

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1A1A1A', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#3a3a3a', lineHeight: '1.55', margin: '0 0 12px' }
