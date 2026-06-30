import * as React from 'react'
import { Img, Section, Text } from '@react-email/components'

// Default Shootbase logo for transactional emails that aren't sent on behalf
// of a Pro (account / system emails).
const DEFAULT_LOGO_URL =
  'https://www.shootbase.co.uk/__l5e/assets-v1/090b7b91-1c83-4ad4-ada6-592190cf11fa/shootbase-logo-email.png'
const DEFAULT_ALT = 'ShootBase'

interface EmailHeaderProps {
  logoUrl?: string | null
  alt?: string | null
  /** When true and no logoUrl is supplied, render the fallback name (or
   *  nothing) instead of the Shootbase default. Use for emails sent on
   *  behalf of a Pro so client-facing mail isn't Shootbase-branded. */
  hideWhenMissing?: boolean
  /** Fallback business name shown as text when no logo is available. */
  fallbackName?: string | null
}

export const EmailHeader = ({
  logoUrl,
  alt,
  hideWhenMissing = false,
  fallbackName,
}: EmailHeaderProps = {}) => {
  const trimmed = logoUrl?.trim() || null
  const url = trimmed || (hideWhenMissing ? null : DEFAULT_LOGO_URL)
  if (!url) {
    if (fallbackName?.trim()) {
      return (
        <Section style={wrap}>
          <Text style={nameText}>{fallbackName}</Text>
        </Section>
      )
    }
    return null
  }
  return (
    <Section style={wrap}>
      <Img
        src={url}
        alt={alt?.trim() || (trimmed ? 'Logo' : DEFAULT_ALT)}
        style={logo}
      />
    </Section>
  )
}

const wrap = {
  padding: '24px 0 16px',
  textAlign: 'center' as const,
  backgroundColor: '#ffffff',
}

const logo = {
  display: 'block',
  margin: '0 auto',
  height: 'auto',
  maxWidth: '160px',
  maxHeight: '60px',
}

const nameText = {
  margin: 0,
  fontSize: '18px',
  fontWeight: 'bold' as const,
  color: '#1A1A1A',
  textAlign: 'center' as const,
}

export default EmailHeader
