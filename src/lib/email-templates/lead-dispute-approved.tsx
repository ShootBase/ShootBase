import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  professionalName?: string;
  leadId?: string;
  reportId?: string;
  credits?: number;
  decisionDate?: string;
  dashboardUrl?: string;
}

const LeadDisputeApproved = ({
  professionalName,
  leadId,
  reportId,
  credits,
  decisionDate,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your dispute has been approved — ShootBase</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your dispute has been approved</Heading>
        <Text style={p}>Hello {professionalName || 'there'},</Text>
        <Text style={p}>We've completed our review of your dispute.</Text>

        <Section style={card}>
          <Text style={detailLine}><strong>Outcome:</strong><br />Approved</Text>
          <Text style={detailLine}><strong>Report ID:</strong><br />{reportId ? reportId.slice(0, 8).toUpperCase() : '—'}</Text>
          <Text style={detailLine}><strong>Project ID:</strong><br />{leadId ? leadId.slice(0, 8).toUpperCase() : '—'}</Text>
          <Text style={detailLine}><strong>Decision Date:</strong><br />{decisionDate || new Date().toLocaleString('en-GB')}</Text>
          {typeof credits === 'number' && credits > 0 ? (
            <Text style={detailLine}><strong>Credits Refunded:</strong><br />{credits}</Text>
          ) : null}
        </Section>

        <Text style={p}>
          If a refund has been approved, it has now been processed or credited to your account.
        </Text>
        <Text style={p}>Thank you for helping us maintain project quality.</Text>

        <Hr style={hr} />
        <Text style={muted}>Regards,<br />ShootBase Support</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: LeadDisputeApproved,
  subject: 'Your dispute has been approved — ShootBase',
  displayName: 'Project dispute approved',
  previewData: {
    professionalName: 'Jane',
    leadId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    reportId: 'r1e2p3o4-r5t6-7890-abcd-ef1234567890',
    credits: 3,
    decisionDate: new Date().toLocaleString('en-GB'),
    dashboardUrl: 'https://www.shootbase.co.uk/pro/dashboard',
  },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px 28px', maxWidth: '600px' as const };
const h1 = { fontSize: '22px', margin: '0 0 12px 0', color: '#111' };
const p = { fontSize: '14px', color: '#333', margin: '0 0 12px 0', lineHeight: '20px' };
const muted = { fontSize: '12px', color: '#777', margin: '4px 0' };
const card = { margin: '12px 0', backgroundColor: '#fafafa', padding: '14px 16px', borderRadius: '4px' };
const detailLine = { fontSize: '14px', color: '#222', margin: '8px 0' };
const hr = { borderColor: '#eee', margin: '18px 0' };
