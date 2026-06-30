import * as React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr, Link } from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  alertType?: string;
  title?: string;
  refId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  userId?: string | null;
  relatedLeadId?: string | null;
  relatedJobTitle?: string | null;
  category?: string | null;
  message?: string;
  submittedAt?: string;
  adminLink?: string;
}

const AdminAlertEmail = ({
  alertType,
  title,
  refId,
  userName,
  userEmail,
  userRole,
  userId,
  relatedLeadId,
  relatedJobTitle,
  category,
  message,
  submittedAt,
  adminLink,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{title || alertType || 'ShootBase support alert'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{title || 'New support alert'}</Heading>
        <Text style={p}>{alertType || 'A new event was submitted on ShootBase.'}</Text>

        <Section style={card}>
          {refId ? <Text style={row}><strong>Reference ID:</strong> {refId}</Text> : null}
          {category ? <Text style={row}><strong>Category:</strong> {category}</Text> : null}
          <Text style={row}><strong>From:</strong> {userName || '—'} {userEmail ? `<${userEmail}>` : ''}</Text>
          <Text style={row}><strong>Role:</strong> {userRole || '—'}</Text>
          {userId ? <Text style={row}><strong>User ID:</strong> {userId}</Text> : null}
          {relatedLeadId ? <Text style={row}><strong>Related Project ID:</strong> {relatedLeadId}</Text> : null}
          {relatedJobTitle ? <Text style={row}><strong>Related Job:</strong> {relatedJobTitle}</Text> : null}
          {submittedAt ? <Text style={row}><strong>Submitted:</strong> {submittedAt}</Text> : null}
        </Section>

        {message ? (
          <>
            <Hr style={hr} />
            <Text style={p}><strong>Details</strong></Text>
            <Text style={messageBox}>{message}</Text>
          </>
        ) : null}

        {adminLink ? (
          <>
            <Hr style={hr} />
            <Text style={p}>
              <Link href={adminLink} style={link}>Open in admin dashboard →</Link>
            </Text>
          </>
        ) : null}

        <Hr style={hr} />
        <Text style={muted}>You are receiving this because you are listed on the ShootBase support distribution.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: AdminAlertEmail,
  subject: (d: Record<string, any>) => d?.title || `ShootBase Support Alert — ${d?.alertType || 'New event'}`,
  displayName: 'Admin support alert',
  previewData: {
    alertType: 'Invalid Contact Report',
    title: 'Invalid Contact Report — ShootBase',
    refId: 'abc-123',
    userName: 'Jane Doe',
    userEmail: 'jane@example.com',
    userRole: 'professional',
    message: 'The phone number is disconnected.',
    submittedAt: '26 Jun 2026, 14:30',
    adminLink: 'https://www.shootbase.co.uk/admin/project-reports',
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
const link = { color: '#b8860b', fontWeight: 600 as const };
