import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  professionalName?: string;
  credits?: number;
  amount?: string;
  reference?: string;
}

const BankTransferApproved = ({ professionalName, credits, amount, reference }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Bank transfer approved — coins added</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Bank transfer approved</Heading>
        <Text style={p}>Hello {professionalName || 'there'},</Text>
        <Text style={p}>Your bank transfer has been approved.</Text>
        <Section style={card}>
          <Text style={detail}><strong>Coins added:</strong> {credits ?? '—'}</Text>
          <Text style={detail}><strong>Amount:</strong> ₦{amount ?? '—'}</Text>
          <Text style={detail}><strong>Transfer reference:</strong> {reference ?? '—'}</Text>
        </Section>
        <Text style={p}>Your coins are now available in your ShootBase account.</Text>
        <Hr style={hr} />
        <Text style={muted}>Regards,<br />ShootBase Nigeria Support</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: BankTransferApproved,
  subject: 'Bank transfer approved — coins added',
  displayName: 'Bank transfer approved',
  previewData: { professionalName: 'Tunde', credits: 50, amount: '60,000', reference: 'TRX-12345' },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px 28px', maxWidth: '600px' as const };
const h1 = { fontSize: '22px', margin: '0 0 12px 0', color: '#111' };
const p = { fontSize: '14px', color: '#333', margin: '0 0 12px 0', lineHeight: '20px' };
const card = { margin: '12px 0', backgroundColor: '#F2FBF4', padding: '14px 16px', borderRadius: '6px' };
const detail = { fontSize: '14px', color: '#222', margin: '4px 0' };
const muted = { fontSize: '12px', color: '#777', margin: '4px 0' };
const hr = { borderColor: '#eee', margin: '18px 0' };
