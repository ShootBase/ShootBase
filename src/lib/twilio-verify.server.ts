// Twilio Verify wrapper — server only.
// Uses the existing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and
// TWILIO_VERIFY_SERVICE_SID environment variables. Never imported from
// client-reachable code; load only inside server-function handlers.

export type TwilioVerifyStatus = "pending" | "approved" | "canceled" | "max_attempts_reached" | "deleted" | "failed" | "expired";

function creds() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !token || !service) {
    throw new Error("Twilio Verify is not configured. Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID.");
  }
  return { sid, token, service, auth: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") };
}

/**
 * Convert a UK-flavoured phone number to E.164. Accepts +44…, 44…, or 0… and
 * strips spaces, dashes, parentheses. Anything else with a leading + is
 * preserved as-is for international callers.
 */
export function toE164(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) throw new Error("invalid_phone");
  // Keep leading + then digits only
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) throw new Error("invalid_phone");
  if (hasPlus) {
    if (digits.length < 7 || digits.length > 15) throw new Error("invalid_phone");
    return "+" + digits;
  }
  // No leading +. Default to UK.
  let d = digits;
  if (d.startsWith("44")) return "+" + d;
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length < 9 || d.length > 12) throw new Error("invalid_phone");
  return "+44" + d;
}

export async function startVerification(phoneE164: string): Promise<{ status: TwilioVerifyStatus; sid: string }> {
  const c = creds();
  const body = new URLSearchParams({ To: phoneE164, Channel: "sms" });
  const res = await fetch(`https://verify.twilio.com/v2/Services/${c.service}/Verifications`, {
    method: "POST",
    headers: {
      Authorization: c.auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (json as { code?: number }).code;
    const msg = (json as { message?: string }).message ?? "twilio_error";
    // 60200 = invalid phone, 60203 = max send attempts
    if (code === 60200) throw new Error("invalid_phone");
    if (code === 60203 || code === 60410) throw new Error("rate_limited");
    throw new Error(msg);
  }
  return { status: (json as { status: TwilioVerifyStatus }).status, sid: (json as { sid: string }).sid };
}

export async function checkVerification(phoneE164: string, code: string): Promise<{ status: TwilioVerifyStatus; valid: boolean }> {
  const c = creds();
  const body = new URLSearchParams({ To: phoneE164, Code: code });
  const res = await fetch(`https://verify.twilio.com/v2/Services/${c.service}/VerificationCheck`, {
    method: "POST",
    headers: {
      Authorization: c.auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code404 = res.status === 404;
    // 404 means the verification has expired or doesn't exist.
    if (code404) return { status: "expired", valid: false };
    const tcode = (json as { code?: number }).code;
    const msg = (json as { message?: string }).message ?? "twilio_error";
    if (tcode === 60202) throw new Error("too_many_attempts");
    throw new Error(msg);
  }
  const status = (json as { status: TwilioVerifyStatus }).status;
  return { status, valid: status === "approved" };
}
