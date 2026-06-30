import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { TemplateEntry } from './registry';

interface Props {
  roleLabel?: string;
  inviterName?: string | null;
  acceptUrl?: string;
  expiresAt?: string;
  siteName?: string;
}

const StaffInvite = ({
  roleLabel = 'Staff member',
  inviterName,
  acceptUrl = 'https://www.shootbase.co.uk',
  expiresAt,
  siteName = 'Shootbase',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join the {siteName} team</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You're invited to join {siteName}</Heading>
        <Text style={p}>
          {inviterName ? `${inviterName} has invited you` : 'You have been invited'} to
          join the {siteName} team as <strong>{roleLabel}</strong>.
        </Text>
        <Text style={p}>
          Click the button below to activate your staff account and set your password.
        </Text>

        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button href={acceptUrl} style={btn}>
            Accept invitation
          </Button>
        </Section>

        <Text style={muted}>
          Or copy this link into your browser:
          <br />
          <span style={{ wordBreak: 'break-all' }}>{acceptUrl}</span>
        </Text>

        <Hr style={hr} />
        <Text style={muted}>
          {expiresAt
            ? `This invitation expires on ${new Date(expiresAt).toLocaleString()}.`
            : 'This invitation will expire soon.'}{' '}
          If you weren't expecting this email, you can safely ignore it.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: StaffInvite,
  subject: (d: Record<string, any>) =>
    `You're invited to join ${d.siteName ?? 'Shootbase'}${d.roleLabel ? ` as ${d.roleLabel}` : ''}`,
  displayName: 'Staff invitation',
  previewData: {
    roleLabel: 'Support Agent',
    inviterName: 'Alex',
    acceptUrl: 'https://www.shootbase.co.uk/staff/accept?token=demo',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    siteName: 'Shootbase',
  },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { padding: '24px 28px', maxWidth: '600px' as const };
const h1 = { fontSize: '22px', margin: '0 0 12px 0', color: '#111' };
const p = { fontSize: '14px', color: '#333', margin: '0 0 12px 0', lineHeight: '20px' };
const muted = { fontSize: '12px', color: '#777', margin: '8px 0', lineHeight: '18px' };
const hr = { borderColor: '#eee', margin: '18px 0' };
const btn = {
  backgroundColor: '#111',
  color: '#fff',
  padding: '12px 22px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 600,
  display: 'inline-block',
};
