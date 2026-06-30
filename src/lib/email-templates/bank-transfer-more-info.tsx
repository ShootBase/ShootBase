import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  professionalName?: string;
  amount?: string;
  reference?: string;
  message?: string;
}

const BankTransferMoreInfo = ({ professionalName, amount, reference, message }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We need more info to verify your bank transfer</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>We need a little more information</Heading>
        <Text style={p}>Hello {professionalName || 'there'},</Text>
        <Text style={p}>Our team is reviewing your bank transfer but needs more information to verify the payment.</Text>
        <Section style={card}>
          <Text style={detail}><strong>Amount:</strong> ₦{amount ?? '—'}</Text>
          <Text style={detail}><strong>Transfer reference:</strong> {reference ?? '—'}</Text>
          <Text style={detail}><strong>What we need:</strong></Text>
          <Text style={detail}>{message || 'Please reply with proof of payment (screenshot of the bank confirmation).'}</Text>
        </Section>
        <Text style={p}>Reply to this email with the requested details and we'll continue your review.</Text>
        <Hr style={hr} />
        <Text style={muted}>Regards,<br />ShootBase Nigeria Support</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: BankTransferMoreInfo,
  subject: 'Action needed: more info on your bank transfer',
  displayName: 'Bank transfer — more info requested',
  previewData: { professionalName: 'Tunde', amount: '60,000', reference: 'TRX-12345', message: 'Please send a screenshot of the bank confirmation.' },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px 28px', maxWidth: '600px' as const };
const h1 = { fontSize: '22px', margin: '0 0 12px 0', color: '#111' };
const p = { fontSize: '14px', color: '#333', margin: '0 0 12px 0', lineHeight: '20px' };
const card = { margin: '12px 0', backgroundColor: '#FBF7EE', padding: '14px 16px', borderRadius: '6px' };
const detail = { fontSize: '14px', color: '#222', margin: '4px 0' };
const muted = { fontSize: '12px', color: '#777', margin: '4px 0' };
const hr = { borderColor: '#eee', margin: '18px 0' };
