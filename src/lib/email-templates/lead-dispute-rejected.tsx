import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  professionalName?: string;
  leadId?: string;
  reportId?: string;
  adminNotes?: string | null;
  decisionDate?: string;
  supportUrl?: string;
}

const LeadDisputeRejected = ({
  professionalName,
  leadId,
  reportId,
  adminNotes,
  decisionDate,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your dispute has been reviewed — ShootBase</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your dispute has been reviewed</Heading>
        <Text style={p}>Hello {professionalName || 'there'},</Text>
        <Text style={p}>We've completed our review of your dispute.</Text>

        <Section style={card}>
          <Text style={detailLine}><strong>Outcome:</strong><br />Rejected</Text>
          {adminNotes ? (
            <Text style={detailLine}><strong>Reason:</strong><br />{adminNotes}</Text>
          ) : null}
          <Text style={detailLine}><strong>Report ID:</strong><br />{reportId ? reportId.slice(0, 8).toUpperCase() : '—'}</Text>
          <Text style={detailLine}><strong>Project ID:</strong><br />{leadId ? leadId.slice(0, 8).toUpperCase() : '—'}</Text>
          <Text style={detailLine}><strong>Decision Date:</strong><br />{decisionDate || new Date().toLocaleString('en-GB')}</Text>
        </Section>

        <Text style={p}>Thank you for helping us maintain project quality.</Text>

        <Hr style={hr} />
        <Text style={muted}>Regards,<br />ShootBase Support</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: LeadDisputeRejected,
  subject: 'Your dispute has been reviewed — ShootBase',
  displayName: 'Project dispute rejected',
  previewData: {
    professionalName: 'Jane',
    leadId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    reportId: 'r1e2p3o4-r5t6-7890-abcd-ef1234567890',
    adminNotes: 'We called the number and reached the customer successfully.',
    decisionDate: new Date().toLocaleString('en-GB'),
    supportUrl: 'https://www.shootbase.co.uk/help',
  },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px 28px', maxWidth: '600px' as const };
const h1 = { fontSize: '22px', margin: '0 0 12px 0', color: '#111' };
const p = { fontSize: '14px', color: '#333', margin: '0 0 12px 0', lineHeight: '20px' };
const muted = { fontSize: '12px', color: '#777', margin: '4px 0' };
const card = { margin: '12px 0', backgroundColor: '#fafafa', padding: '14px 16px', borderRadius: '4px' };
const detailLine = { fontSize: '14px', color: '#222', margin: '8px 0', whiteSpace: 'pre-wrap' as const };
const hr = { borderColor: '#eee', margin: '18px 0' };
