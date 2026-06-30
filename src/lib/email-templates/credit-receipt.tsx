import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Row, Column, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailHeader } from './_header'

interface Props {
  receiptNumber?: string
  customerName?: string
  customerEmail?: string
  purchaseDate?: string
  packageName?: string
  credits?: number
  amountPence?: number
  stripePaymentId?: string
  receiptUrl?: string
}

function gbp(p = 0) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(p / 100)
}

const Email = ({
  receiptNumber = 'SB-0001',
  customerName = 'there',
  customerEmail = '',
  purchaseDate = new Date().toISOString().slice(0, 10),
  packageName = 'Shootbase Credits',
  credits = 0,
  amountPence = 0,
  stripePaymentId = '',
  receiptUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Shootbase receipt {receiptNumber} — {gbp(amountPence)}</Preview>
    <Body style={main}>
      <Container style={container}>
        <EmailHeader />
        <Heading style={h1}>Payment received</Heading>
        <Text style={text}>
          Hi {customerName},
        </Text>
        <Text style={text}>
          Thanks for your purchase. Your Shootbase credits are now available in your account.
          Below is your receipt — please keep it for your records.
        </Text>

        <Section style={metaBox}>
          <Row>
            <Column style={metaCol}>
              <Text style={metaLabel}>Receipt no.</Text>
              <Text style={metaValue}>{receiptNumber}</Text>
            </Column>
            <Column style={metaCol}>
              <Text style={metaLabel}>Date</Text>
              <Text style={metaValue}>{purchaseDate}</Text>
            </Column>
            <Column style={metaCol}>
              <Text style={metaLabel}>Amount paid</Text>
              <Text style={{ ...metaValue, fontWeight: 'bold' }}>{gbp(amountPence)}</Text>
            </Column>
          </Row>
        </Section>

        <Section style={{ margin: '12px 0 4px' }}>
          <Text style={metaLabel}>Billed to</Text>
          <Text style={{ ...text, margin: '4px 0 0' }}>
            <strong>{customerName}</strong>
            <br />
            {customerEmail}
          </Text>
        </Section>

        <Section style={{ margin: '20px 0' }}>
          <Row style={lineHeader}>
            <Column style={{ ...lineCell, width: '55%' }}>Description</Column>
            <Column style={{ ...lineCell, width: '15%', textAlign: 'right' }}>Credits</Column>
            <Column style={{ ...lineCell, width: '30%', textAlign: 'right' }}>Amount</Column>
          </Row>
          <Row style={lineRow}>
            <Column style={{ ...lineCellBody, width: '55%' }}>{packageName}</Column>
            <Column style={{ ...lineCellBody, width: '15%', textAlign: 'right' }}>{credits}</Column>
            <Column style={{ ...lineCellBody, width: '30%', textAlign: 'right' }}>{gbp(amountPence)}</Column>
          </Row>
          <Row>
            <Column style={{ width: '55%' }} />
            <Column style={{ ...totalsLabel, width: '15%', fontWeight: 'bold' }}>Total</Column>
            <Column style={{ ...totalsValue, width: '30%', fontWeight: 'bold' }}>{gbp(amountPence)}</Column>
          </Row>
        </Section>

        {receiptUrl && (
          <Section style={{ margin: '24px 0' }}>
            <Button style={button} href={receiptUrl}>Download PDF receipt</Button>
          </Section>
        )}

        <Section style={{ margin: '24px 0 0' }}>
          <Text style={metaLabel}>Transaction reference</Text>
          <Text style={{ ...text, fontFamily: 'monospace', fontSize: '12px', margin: '4px 0 0' }}>
            {stripePaymentId}
          </Text>
        </Section>

        <Section style={companyBox}>
          <Text style={companyHeader}>Shootbase Ltd</Text>
          <Text style={companyLine}>Pollard Street East</Text>
          <Text style={companyLine}>M40 7FS Manchester</Text>
        </Section>

        <Text style={footer}>
          This receipt was sent automatically by Shootbase after a successful payment.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const num = (data?.receiptNumber as string | undefined) ?? ''
    return num ? `Your Shootbase receipt ${num}` : 'Your Shootbase receipt'
  },
  displayName: 'Shootbase Credit Receipt',
  previewData: {
    receiptNumber: 'SB-000123',
    customerName: 'Alex Morgan',
    customerEmail: 'alex@example.com',
    purchaseDate: '2026-06-21',
    packageName: 'Growth Pack (60 credits)',
    credits: 60,
    amountPence: 4900,
    stripePaymentId: 'pi_3Pv5xyz123abcDEF',
  },
} satisfies TemplateEntry

export default Email

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1A1A1A', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#3a3a3a', lineHeight: '1.55', margin: '0 0 12px' }
const metaBox = { backgroundColor: '#faf7f0', padding: '14px 16px', borderRadius: '4px', margin: '16px 0' }
const metaCol = { paddingRight: '12px' }
const metaLabel = { fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: '#888', margin: '0 0 4px' }
const metaValue = { fontSize: '14px', color: '#1A1A1A', margin: 0 }
const lineHeader = { borderBottom: '1px solid #e5e0d3' }
const lineCell = { fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#888', padding: '8px 6px' }
const lineRow = { borderBottom: '1px solid #f1ecdf' }
const lineCellBody = { fontSize: '14px', color: '#1A1A1A', padding: '8px 6px' }
const totalsLabel = { fontSize: '13px', color: '#555', padding: '8px 6px', textAlign: 'right' as const }
const totalsValue = { fontSize: '14px', color: '#1A1A1A', padding: '8px 6px', textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }
const button = {
  backgroundColor: '#C5A059',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '4px',
  padding: '12px 22px',
  textDecoration: 'none',
}
const companyBox = { margin: '28px 0 0', padding: '14px 16px', borderTop: '1px solid #ececec' }
const companyHeader = { fontSize: '13px', color: '#1A1A1A', fontWeight: 'bold' as const, margin: '0 0 4px' }
const companyLine = { fontSize: '12px', color: '#666', margin: '0' }
const footer = { fontSize: '12px', color: '#888', margin: '20px 0 0', lineHeight: '1.5' }
