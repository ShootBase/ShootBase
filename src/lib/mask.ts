// Lightweight client-side masking helpers. The server already returns
// pre-masked email/phone via mask_email() / mask_phone(); these mirror that
// format so previews stay consistent before a network round-trip.

export function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.indexOf(".");
  const name = dot === -1 ? domain : domain.slice(0, dot);
  const tld = dot === -1 ? "" : domain.slice(dot);
  return `${local.slice(0, Math.min(2, local.length))}•••••@${name.slice(0, Math.min(2, name.length))}•••${tld}`;
}

export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 6) return "•••";
  return `${d.slice(0, 3)}•••••${d.slice(-3)}`;
}

export function formatMemberSince(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
