import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  professionalName?: string;
  leadId?: string;
  reportId?: string;
  reason?: string;
  submittedAt?: string;
}

const REASON_LABEL: Record<string, string> = {
  disconnected: 'Number is disconnected / out of service',
  wrong_number: 'Wrong number (reached someone else entirely)',
};

const LeadDisputeSubmitted = ({
  professionalName,
  leadId,
  reportId,
  reason,
  submittedAt,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We've received your project dispute request</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>We've Received Your Project Dispute Request</Heading>
        <Text style={p}>Hello {professionalName || 'there'},</Text>
        <Text style={p}>Thank you for reporting an issue with a project.</Text>
        <Text style={p}>
          We have successfully received your dispute request and it is now under review by our team.
        </Text>

        <Section style={card}>
          <Text style={detailLine}><strong>Report ID:</strong> {reportId ? reportId.slice(0, 8).toUpperCase() : '—'}</Text>
          <Text style={detailLine}><strong>Project ID:</strong> {leadId ? leadId.slice(0, 8).toUpperCase() : '—'}</Text>
          <Text style={detailLine}><strong>Date Submitted:</strong> {submittedAt || new Date().toLocaleString('en-GB')}</Text>
          <Text style={detailLine}><strong>Reason:</strong> {reason ? (REASON_LABEL[reason] || reason) : '—'}</Text>
        </Section>

        <Text style={p}>
          Our team will investigate the issue and notify you once a decision has been made.
        </Text>
        <Text style={p}>Thank you for helping us maintain project quality on Shootbase.</Text>

        <Hr style={hr} />
        <Text style={muted}>Regards,<br />Shootbase Support</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: LeadDisputeSubmitted,
  subject: 'We received your dispute — ShootBase',
  displayName: 'Project dispute submitted',
  previewData: {
    professionalName: 'Jane',
    leadId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    reportId: 'r1e2p3o4-r5t6-7890-abcd-ef1234567890',
    reason: 'disconnected',
    submittedAt: new Date().toLocaleString('en-GB'),
  },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px 28px', maxWidth: '600px' as const };
const h1 = { fontSize: '22px', margin: '0 0 12px 0', color: '#111' };
const p = { fontSize: '14px', color: '#333', margin: '0 0 12px 0', lineHeight: '20px' };
const muted = { fontSize: '12px', color: '#777', margin: '4px 0' };
const card = { margin: '12px 0', backgroundColor: '#fafafa', padding: '14px 16px', borderRadius: '4px' };
const detailLine = { fontSize: '14px', color: '#222', margin: '4px 0' };
const hr = { borderColor: '#eee', margin: '18px 0' };
