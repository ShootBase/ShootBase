import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  professionalName?: string;
  amount?: string;
  reference?: string;
  reason?: string;
}

const BankTransferRejected = ({ professionalName, amount, reference, reason }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Bank transfer could not be approved</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Bank transfer not approved</Heading>
        <Text style={p}>Hello {professionalName || 'there'},</Text>
        <Text style={p}>We reviewed your bank transfer submission and were unable to approve it.</Text>
        <Section style={card}>
          <Text style={detail}><strong>Amount:</strong> ₦{amount ?? '—'}</Text>
          <Text style={detail}><strong>Transfer reference:</strong> {reference ?? '—'}</Text>
          <Text style={detail}><strong>Reason:</strong> {reason || 'See message from our team.'}</Text>
        </Section>
        <Text style={p}>If you believe this was a mistake, reply to this email with proof of payment and we'll re-review.</Text>
        <Hr style={hr} />
        <Text style={muted}>Regards,<br />ShootBase Nigeria Support</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: BankTransferRejected,
  subject: 'Bank transfer not approved — ShootBase Nigeria',
  displayName: 'Bank transfer rejected',
  previewData: { professionalName: 'Tunde', amount: '60,000', reference: 'TRX-12345', reason: 'Reference not matched.' },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px 28px', maxWidth: '600px' as const };
const h1 = { fontSize: '22px', margin: '0 0 12px 0', color: '#111' };
const p = { fontSize: '14px', color: '#333', margin: '0 0 12px 0', lineHeight: '20px' };
const card = { margin: '12px 0', backgroundColor: '#FBF3F3', padding: '14px 16px', borderRadius: '6px' };
const detail = { fontSize: '14px', color: '#222', margin: '4px 0' };
const muted = { fontSize: '12px', color: '#777', margin: '4px 0' };
const hr = { borderColor: '#eee', margin: '18px 0' };
