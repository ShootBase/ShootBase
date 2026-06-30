import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  ticketId?: string;
  submitterName?: string | null;
  subject?: string | null;
  category?: string | null;
  message?: string;
  submittedAt?: string;
  helpUrl?: string;
}

const SupportTicketConfirmation = ({
  ticketId,
  submitterName,
  subject,
  category,
  message,
  submittedAt,
  helpUrl,
}: Props) => {
  const shortId = ticketId ? ticketId.slice(0, 8).toUpperCase() : '—';
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>We've received your support request — Shootbase Support</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>We've received your request</Heading>
          <Text style={p}>
            {submitterName ? `Hi ${submitterName},` : 'Hi there,'}
          </Text>
          <Text style={p}>
            Thanks for contacting Shootbase Support. Our team will get back to you within
            24–48 hours. You can reply directly to this email to add more details — your
            reply will be attached to the same ticket.
          </Text>

          <Section style={card}>
            <Text style={row}><strong>Ticket ID:</strong> {shortId}</Text>
            {subject ? <Text style={row}><strong>Subject:</strong> {subject}</Text> : null}
            {category ? <Text style={row}><strong>Category:</strong> {category}</Text> : null}
            {submittedAt ? <Text style={row}><strong>Submitted:</strong> {submittedAt}</Text> : null}
          </Section>

          <Hr style={hr} />
          <Text style={p}><strong>Your message</strong></Text>
          <Text style={messageBox}>{message ?? ''}</Text>

          <Hr style={hr} />
          <Text style={muted}>
            Need to add more details? Reply to this email or visit {helpUrl ?? 'https://www.shootbase.co.uk/help'}.
          </Text>
          <Text style={muted}>
            — Shootbase Support · support@shootbase.co.uk
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: SupportTicketConfirmation,
  subject: (data: Record<string, any>) => {
    const id = typeof data?.ticketId === 'string' ? data.ticketId.slice(0, 8).toUpperCase() : '';
    const subj = typeof data?.subject === 'string' && data.subject ? ` — ${data.subject}` : '';
    return id ? `We've received your request${subj} [TICKET #${id}]` : `We've received your request${subj}`;
  },
  displayName: 'Support ticket confirmation',
  previewData: {
    ticketId: 'abc-12345',
    submitterName: 'Jane Doe',
    subject: 'Coins not credited',
    category: 'Payments & Coins',
    message: 'I purchased 50 coins yesterday but they have not appeared on my account.',
    submittedAt: '26 Jun 2026, 14:30',
    helpUrl: 'https://www.shootbase.co.uk/help',
  },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px 28px', maxWidth: '600px' as const };
const h1 = { fontSize: '22px', margin: '0 0 12px 0', color: '#111' };
const p = { fontSize: '14px', color: '#333', margin: '0 0 12px 0', lineHeight: '20px' };
const muted = { fontSize: '12px', color: '#777', margin: '4px 0' };
const row = { fontSize: '14px', color: '#222', margin: '4px 0' };
const card = { backgroundColor: '#f7f7f5', padding: '14px 16px', borderRadius: '4px', margin: '12px 0' };
const messageBox = { fontSize: '14px', color: '#222', whiteSpace: 'pre-wrap' as const, backgroundColor: '#fafafa', padding: '12px 14px', borderRadius: '4px' };
const hr = { borderColor: '#eee', margin: '18px 0' };
