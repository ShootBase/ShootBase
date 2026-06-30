import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  recipientName?: string;
  body?: string;
  ticketId?: string;
  category?: string | null;
  helpUrl?: string;
  conversationHistory?: Array<{
    author: string;
    body: string;
    createdAt: string;
  }>;
}

const SupportReply = ({ recipientName, body, ticketId, category, helpUrl, conversationHistory = [] }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New message from Shootbase Support</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New message from Shootbase Support</Heading>
        <Text style={p}>Hello {recipientName?.trim() || 'there'},</Text>
        <Text style={p}>
          You have received a new message from Shootbase Support
          {category ? ` regarding “${category}”` : ''}.
        </Text>

        <Text style={p}><strong>Message:</strong></Text>
        <Section style={card}>
          <Text style={messageBox}>{body ?? ''}</Text>
        </Section>

        <Text style={p}>
          Please log in to your Shootbase account to reply
          {helpUrl ? <> — <a href={helpUrl} style={link}>{helpUrl}</a></> : null}.
        </Text>

        <Text style={p}>Regards,<br />Shootbase Support</Text>

        {conversationHistory.length > 0 && (
          <Section style={historyCard}>
            <Text style={historyTitle}>Conversation history</Text>
            {conversationHistory.map((item, index) => (
              <Section key={`${item.createdAt}-${index}`} style={historyItem}>
                <Text style={historyMeta}>{item.author} · {item.createdAt}</Text>
                <Text style={historyBody}>{item.body}</Text>
              </Section>
            ))}
          </Section>
        )}

        <Hr style={hr} />
        <Text style={muted}>
          Reference: {ticketId ? ticketId.slice(0, 8) : '—'}
        </Text>
        <Text style={muted}>
          You can reply directly to this email or visit {helpUrl ?? 'https://www.shootbase.co.uk/help'}.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: SupportReply,
  subject: (data: Record<string, any>) => {
    const id = typeof data?.ticketId === 'string' ? data.ticketId.slice(0, 8).toUpperCase() : '';
    return id ? `Re: Your Shootbase support request [TICKET #${id}]` : 'Reply from Shootbase Support';
  },
  displayName: 'Support reply',
  previewData: {
    body: 'Hi there, thanks for reaching out — here is the answer to your question…',
    ticketId: 'abc-123',
    category: 'Billing',
    helpUrl: 'https://www.shootbase.co.uk/help',
    conversationHistory: [
      { author: 'Customer', body: 'I need help with my account.', createdAt: '24 Jun 2026, 10:30' },
      { author: 'Shootbase Support', body: 'Of course — we can help.', createdAt: '24 Jun 2026, 10:45' },
    ],
  },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px 28px', maxWidth: '600px' as const };
const h1 = { fontSize: '22px', margin: '0 0 12px 0', color: '#111' };
const p = { fontSize: '14px', color: '#333', margin: '0 0 12px 0', lineHeight: '20px' };
const muted = { fontSize: '12px', color: '#777', margin: '4px 0' };
const link = { color: '#b8862b', textDecoration: 'underline' };
const card = { margin: '12px 0' };
const messageBox = {
  fontSize: '14px',
  color: '#222',
  whiteSpace: 'pre-wrap' as const,
  backgroundColor: '#fafafa',
  padding: '14px 16px',
  borderRadius: '4px',
  lineHeight: '20px',
};
const hr = { borderColor: '#eee', margin: '18px 0' };
const historyCard = {
  border: '1px solid #eee',
  borderRadius: '6px',
  margin: '18px 0 0',
  padding: '12px 14px',
};
const historyTitle = { fontSize: '13px', fontWeight: 700, color: '#111', margin: '0 0 10px' };
const historyItem = { borderTop: '1px solid #f1f1f1', padding: '10px 0 0', margin: '10px 0 0' };
const historyMeta = { fontSize: '11px', color: '#777', margin: '0 0 4px' };
const historyBody = { fontSize: '13px', color: '#333', margin: 0, lineHeight: '19px', whiteSpace: 'pre-wrap' as const };
