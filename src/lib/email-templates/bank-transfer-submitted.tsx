import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  professionalName?: string;
  amount?: string;
  reference?: string;
  packageName?: string;
  submittedAt?: string;
}

const BankTransferSubmitted = ({ professionalName, amount, reference, packageName, submittedAt }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Bank transfer received — pending review</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Bank transfer submitted</Heading>
        <Text style={p}>Hello {professionalName || 'there'},</Text>
        <Text style={p}>We have received your bank transfer submission.</Text>
        <Section style={card}>
          {packageName && <Text style={detail}><strong>Package:</strong> {packageName}</Text>}
          <Text style={detail}><strong>Amount:</strong> ₦{amount ?? '—'}</Text>
          <Text style={detail}><strong>Transfer reference:</strong> {reference ?? '—'}</Text>
          <Text style={detail}><strong>Status:</strong> Pending Review</Text>
          <Text style={detail}><strong>Submitted:</strong> {submittedAt || new Date().toLocaleString('en-NG')}</Text>
        </Section>
        <Text style={p}>Our team will review your payment and credit your coins once verified.</Text>
        <Hr style={hr} />
        <Text style={muted}>Regards,<br />ShootBase Nigeria Support</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: BankTransferSubmitted,
  subject: 'Bank transfer submitted — ShootBase Nigeria',
  displayName: 'Bank transfer submitted',
  previewData: { professionalName: 'Tunde', amount: '60,000', reference: 'TRX-12345', packageName: '50 coins' },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px 28px', maxWidth: '600px' as const };
const h1 = { fontSize: '22px', margin: '0 0 12px 0', color: '#111' };
const p = { fontSize: '14px', color: '#333', margin: '0 0 12px 0', lineHeight: '20px' };
const card = { margin: '12px 0', backgroundColor: '#FBF7EE', padding: '14px 16px', borderRadius: '6px' };
const detail = { fontSize: '14px', color: '#222', margin: '4px 0' };
const muted = { fontSize: '12px', color: '#777', margin: '4px 0' };
const hr = { borderColor: '#eee', margin: '18px 0' };
