import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  ticketId?: string;
  submitterName?: string | null;
  submitterEmail?: string | null;
  submitterRole?: string | null;
  subject?: string | null;
  category?: string | null;
  message?: string;
  attachmentCount?: number;
}

const SupportTicketNotify = ({
  ticketId,
  submitterName,
  submitterEmail,
  submitterRole,
  subject,
  category,
  message,
  attachmentCount,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New support ticket on Shootbase</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New support ticket</Heading>
        <Text style={p}>A new support request was submitted on Shootbase.</Text>

        <Section style={card}>
          <Text style={row}><strong>Ticket ID:</strong> {ticketId ?? '—'}</Text>
          <Text style={row}><strong>From:</strong> {submitterName || '—'} {submitterEmail ? `<${submitterEmail}>` : ''}</Text>
          <Text style={row}><strong>Role:</strong> {submitterRole || '—'}</Text>
          <Text style={row}><strong>Subject:</strong> {subject || '—'}</Text>
          <Text style={row}><strong>Category:</strong> {category || '—'}</Text>
          <Text style={row}><strong>Attachments:</strong> {attachmentCount ?? 0}</Text>
        </Section>

        <Hr style={hr} />
        <Text style={p}><strong>Message</strong></Text>
        <Text style={messageBox}>{message ?? ''}</Text>

        <Hr style={hr} />
        <Text style={muted}>Reply via the admin Tickets inbox.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: SupportTicketNotify,
  subject: (d: Record<string, any>) =>
    `New support ticket${d?.subject ? ` — ${d.subject}` : d?.category ? ` — ${d.category}` : ''}`,
  displayName: 'Support ticket notification',
  previewData: {
    ticketId: 'abc-123',
    submitterName: 'Jane Doe',
    submitterEmail: 'jane@example.com',
    submitterRole: 'professional',
    category: 'Billing',
    message: 'I have a question about my invoice.',
    attachmentCount: 0,
  },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px 28px', maxWidth: '600px' as const };
const h1 = { fontSize: '22px', margin: '0 0 12px 0', color: '#111' };
const p = { fontSize: '14px', color: '#333', margin: '0 0 12px 0', lineHeight: '20px' };
const muted = { fontSize: '12px', color: '#777', margin: '0' };
const row = { fontSize: '14px', color: '#222', margin: '4px 0' };
const card = { backgroundColor: '#f7f7f5', padding: '14px 16px', borderRadius: '4px', margin: '12px 0' };
const messageBox = { fontSize: '14px', color: '#222', whiteSpace: 'pre-wrap' as const, backgroundColor: '#fafafa', padding: '12px 14px', borderRadius: '4px' };
const hr = { borderColor: '#eee', margin: '18px 0' };
