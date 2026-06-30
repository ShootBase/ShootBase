// Isomorphic detection of personal contact details in a Pro's public bio.
// Used both client-side (live warning) and server-side (hard block on save).

export const BIO_CONTACT_BLOCK_MESSAGE =
  'Sharing personal contact details in your bio is not allowed. You need to unlock leads to contact clients.';

export type BioContactIssue =
  | 'email'
  | 'phone'
  | 'url'
  | 'social'
  | 'contact-cta';

/**
 * Returns the first contact-info issue detected, or null if the bio is clean.
 * Designed to defeat common obfuscation: "name at domain dot com", "@ handle",
 * spaced-out phone numbers, "IG: user", etc.
 */
export function detectBioContactInfo(raw: string | null | undefined): BioContactIssue | null {
  if (!raw) return null;
  const original = String(raw);
  if (!original.trim()) return null;

  // Normalise for obfuscated patterns
  let s = ` ${original.toLowerCase()} `;
  s = s
    .replace(/\s*\(\s*at\s*\)\s*/g, '@')
    .replace(/\s*\[\s*at\s*\]\s*/g, '@')
    .replace(/\s*\{\s*at\s*\}\s*/g, '@')
    .replace(/\s+at\s+/g, '@')
    .replace(/\s*\(\s*dot\s*\)\s*/g, '.')
    .replace(/\s*\[\s*dot\s*\]\s*/g, '.')
    .replace(/\s+dot\s+/g, '.')
    .replace(/\s*@\s*/g, '@')
    .replace(/(\w)\s*\.\s*(\w)/g, '$1.$2');

  // Email
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return 'email';

  // URLs / domains
  if (/\b(?:https?:\/\/|www\.)\S+/i.test(original)) return 'url';
  if (
    /\b[a-z0-9-]{2,}\.(?:com|co\.uk|co|net|org|io|me|uk|tv|app|dev|biz|info|shop|store|gallery|photo|photography|studio|link|page|site)\b/i.test(
      s,
    )
  )
    return 'url';

  // Phone numbers — 9+ digits ignoring separators
  const digitsOnly = (original.match(/\d/g) || []).length;
  if (digitsOnly >= 9 && /(?:\+?\d[\s\-().]*){9,}/.test(original)) return 'phone';

  // Social handle mention (@something)
  if (/(?:^|[\s,;:.])@[a-z0-9._]{2,}/i.test(original)) return 'social';

  // Social platform keyword followed by a handle / username
  if (
    /\b(?:insta(?:gram)?|ig|tiktok|tt|fb|facebook|snap(?:chat)?|whats[\s-]?app|wa|telegram|tg|twitter|youtube|yt|snap|threads)\b\s*[:\-=]?\s*@?[a-z0-9._]{2,}/i.test(
      s,
    )
  )
    return 'social';

  // Direct-contact CTAs
  if (/\b(?:call|text|whats[\s-]?app|dm|email|message|ring|phone)\s+me\b/i.test(original))
    return 'contact-cta';
  if (/\b(?:contact|reach)\s+me\s+(?:on|at|via)\b/i.test(original)) return 'contact-cta';

  return null;
}

export function bioContactIssueLabel(issue: BioContactIssue): string {
  switch (issue) {
    case 'email':
      return 'an email address';
    case 'phone':
      return 'a phone number';
    case 'url':
      return 'a website or external link';
    case 'social':
      return 'a social media handle';
    case 'contact-cta':
      return 'a direct-contact instruction';
  }
}
