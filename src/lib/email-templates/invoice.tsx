import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Row, Column, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailHeader } from './_header'

interface LineItem {
  description: string
  quantity: number
  rate_pence: number
}

interface PaymentLink {
  id?: string
  label?: string
  url: string
}

interface Props {
  invoiceNumber?: string
  clientName?: string
  fromName?: string
  invoiceDate?: string
  dueDate?: string | null
  projectDescription?: string | null
  lineItems?: LineItem[]
  subtotalPence?: number
  taxPence?: number
  totalPence?: number
  taxRate?: number
  taxEnabled?: boolean
  notes?: string | null
  invoiceUrl?: string
  bankDetails?: string | null
  paymentLinks?: PaymentLink[]
  showBankDetails?: boolean
  showPaymentLinks?: boolean
  logoUrl?: string | null
  businessName?: string | null
}

function gbp(p = 0) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(p / 100)
}

const Email = ({
  invoiceNumber = 'INV-0001',
  clientName = 'there',
  fromName = 'your photographer',
  invoiceDate = new Date().toISOString().slice(0, 10),
  dueDate = null,
  projectDescription = null,
  lineItems = [],
  subtotalPence = 0,
  taxPence = 0,
  totalPence = 0,
  taxRate = 0,
  taxEnabled = false,
  notes = null,
  invoiceUrl,
  bankDetails = null,
  paymentLinks = [],
  showBankDetails = false,
  showPaymentLinks = false,
  logoUrl = null,
  businessName = null,
}: Props) => {
  const visibleLinks = (paymentLinks ?? []).filter((l) => (l?.url ?? '').trim().length > 0)
  const showBank = showBankDetails && (bankDetails ?? '').trim().length > 0
  const showLinks = showPaymentLinks && visibleLinks.length > 0
  const primaryLink = showLinks ? visibleLinks[0] : null
  return (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Invoice {invoiceNumber} from {fromName} — {gbp(totalPence)}</Preview>
    <Body style={main}>
      <Container style={container}>
        <EmailHeader
          logoUrl={logoUrl}
          alt={businessName || fromName}
          hideWhenMissing
          fallbackName={businessName || fromName}
        />
        <Heading style={h1}>Invoice {invoiceNumber}</Heading>
        <Text style={text}>
          Hi {clientName},
        </Text>
        <Text style={text}>
          Please find your invoice from <strong>{fromName}</strong> below.
          {projectDescription ? <> Project: <em>{projectDescription}</em>.</> : null}
        </Text>

        <Section style={metaBox}>
          <Row>
            <Column style={metaCol}>
              <Text style={metaLabel}>Invoice date</Text>
              <Text style={metaValue}>{invoiceDate}</Text>
            </Column>
            {dueDate ? (
              <Column style={metaCol}>
                <Text style={metaLabel}>Due date</Text>
                <Text style={metaValue}>{dueDate}</Text>
              </Column>
            ) : null}
            <Column style={metaCol}>
              <Text style={metaLabel}>Total</Text>
              <Text style={{ ...metaValue, fontWeight: 'bold' }}>{gbp(totalPence)}</Text>
            </Column>
          </Row>
        </Section>

        {lineItems.length > 0 && (
          <Section style={{ margin: '20px 0' }}>
            <Row style={lineHeader}>
              <Column style={{ ...lineCell, width: '55%' }}>Description</Column>
              <Column style={{ ...lineCell, width: '15%', textAlign: 'right' }}>Qty</Column>
              <Column style={{ ...lineCell, width: '15%', textAlign: 'right' }}>Rate</Column>
              <Column style={{ ...lineCell, width: '15%', textAlign: 'right' }}>Total</Column>
            </Row>
            {lineItems.map((it, idx) => (
              <Row key={idx} style={lineRow}>
                <Column style={{ ...lineCellBody, width: '55%' }}>{it.description || '—'}</Column>
                <Column style={{ ...lineCellBody, width: '15%', textAlign: 'right' }}>{it.quantity}</Column>
                <Column style={{ ...lineCellBody, width: '15%', textAlign: 'right' }}>{gbp(it.rate_pence)}</Column>
                <Column style={{ ...lineCellBody, width: '15%', textAlign: 'right' }}>
                  {gbp(Math.round(it.quantity * it.rate_pence))}
                </Column>
              </Row>
            ))}
            <Hr style={hr} />
            <Row>
              <Column style={{ width: '70%' }} />
              <Column style={{ ...totalsLabel, width: '15%' }}>Subtotal</Column>
              <Column style={{ ...totalsValue, width: '15%' }}>{gbp(subtotalPence)}</Column>
            </Row>
            {taxEnabled && (
              <Row>
                <Column style={{ width: '70%' }} />
                <Column style={{ ...totalsLabel, width: '15%' }}>Tax ({taxRate}%)</Column>
                <Column style={{ ...totalsValue, width: '15%' }}>{gbp(taxPence)}</Column>
              </Row>
            )}
            <Row>
              <Column style={{ width: '70%' }} />
              <Column style={{ ...totalsLabel, width: '15%', fontWeight: 'bold' }}>Total</Column>
              <Column style={{ ...totalsValue, width: '15%', fontWeight: 'bold' }}>{gbp(totalPence)}</Column>
            </Row>
          </Section>
        )}

        {notes && (
          <Section style={{ margin: '16px 0' }}>
            <Text style={metaLabel}>Notes</Text>
            <Text style={text}>{notes}</Text>
          </Section>
        )}

        {showLinks && (
          <Section style={{ margin: '20px 0' }}>
            <Text style={metaLabel}>Pay online</Text>
            {primaryLink && (
              <Button style={button} href={primaryLink.url}>
                {primaryLink.label?.trim() ? primaryLink.label : 'Pay now'}
              </Button>
            )}
            {visibleLinks.length > 1 && (
              <Text style={{ ...text, margin: '12px 0 0' }}>
                {visibleLinks.slice(1).map((l, i) => (
                  <span key={l.id ?? i}>
                    <a href={l.url} style={linkStyle}>
                      {l.label?.trim() ? l.label : l.url}
                    </a>
                    {i < visibleLinks.length - 2 ? ' · ' : ''}
                  </span>
                ))}
              </Text>
            )}
          </Section>
        )}

        {showBank && (
          <Section style={{ margin: '20px 0' }}>
            <Text style={metaLabel}>Bank transfer</Text>
            <Text style={{ ...text, whiteSpace: 'pre-wrap' as const }}>{bankDetails}</Text>
          </Section>
        )}

        {invoiceUrl && (
          <Section style={{ margin: '24px 0' }}>
            <Button style={secondaryButton} href={invoiceUrl}>Download invoice PDF</Button>
          </Section>
        )}

        <Text style={footer}>
          This invoice was sent on behalf of {fromName}. Payment is arranged
          directly with {fromName}.
        </Text>
      </Container>
    </Body>
  </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const num = (data?.invoiceNumber as string | undefined) ?? ''
    const from = (data?.fromName as string | undefined) ?? 'your photographer'
    return num
      ? `Invoice ${num} from ${from}`
      : `Invoice from ${from}`
  },
  displayName: 'Invoice',
  previewData: {
    invoiceNumber: 'INV-0001',
    clientName: 'Sarah',
    fromName: 'Aurora Studios',
    invoiceDate: '2026-06-21',
    dueDate: '2026-07-21',
    projectDescription: 'Wedding photography — full day',
    lineItems: [
      { description: 'Coverage (10h)', quantity: 10, rate_pence: 15000 },
      { description: 'Edited gallery', quantity: 1, rate_pence: 30000 },
    ],
    subtotalPence: 180000,
    taxPence: 36000,
    totalPence: 216000,
    taxRate: 20,
    taxEnabled: true,
    notes: 'Thanks for choosing us!',
    bankDetails: 'Aurora Studios Ltd\nSort code: 12-34-56\nAccount: 12345678',
    paymentLinks: [{ id: '1', label: 'Pay with card', url: 'https://buy.stripe.com/test' }],
    showBankDetails: true,
    showPaymentLinks: true,
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
const totalsLabel = { fontSize: '13px', color: '#555', padding: '4px 6px', textAlign: 'right' as const }
const totalsValue = { fontSize: '14px', color: '#1A1A1A', padding: '4px 6px', textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }
const hr = { borderColor: '#e5e0d3', margin: '8px 0' }
const button = {
  backgroundColor: '#C5A059',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '4px',
  padding: '12px 22px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#888', margin: '28px 0 0', lineHeight: '1.5' }
const secondaryButton = {
  backgroundColor: '#ffffff',
  color: '#1A1A1A',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '4px',
  padding: '11px 22px',
  textDecoration: 'none',
  border: '1px solid #d6d6d6',
}
const linkStyle = { color: '#C5A059', textDecoration: 'underline' }
