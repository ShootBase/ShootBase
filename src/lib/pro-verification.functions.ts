import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Shared helper — returns email + phone verification status for the caller.
 * Used by the Pro dashboard banner, gating logic, and email-confirmation
 * trigger after phone verification.
 */
export async function loadVerificationStatus(
  supabase: { from: (table: string) => any },
  userId: string,
  claims: { email_verified?: boolean; amr?: { method?: string }[] } | undefined,
): Promise<{ email_verified: boolean; phone_verified: boolean; phone: string; account_type: string | null }> {
  const isOAuth = (claims?.amr ?? []).some((a) => a.method && a.method !== "password" && a.method !== "otp");
  const email_verified = !!claims?.email_verified || isOAuth;
  const { data: prof } = await supabase
    .from("profiles")
    .select("phone, verified_phone, account_type")
    .eq("id", userId)
    .maybeSingle();
  const p = (prof ?? null) as { phone?: string; verified_phone?: boolean; account_type?: string | null } | null;
  return {
    email_verified,
    phone_verified: !!p?.verified_phone,
    phone: p?.phone ?? "",
    account_type: p?.account_type ?? null,
  };
}

/**
 * Throws a structured "verification_required" error when the caller is a
 * professional account that has not yet completed email + phone verification.
 * Pro gating is enforced server-side so the UI cannot be bypassed.
 */
export async function requireProVerified(
  supabase: { from: (table: string) => any },
  userId: string,
  claims: { email_verified?: boolean; amr?: { method?: string }[] } | undefined,
): Promise<void> {
  const s = await loadVerificationStatus(supabase, userId, claims);
  if (s.account_type !== "professional") return; // gate only applies to pros
  if (s.email_verified && s.phone_verified) return;
  const missing = [!s.email_verified && "email", !s.phone_verified && "phone"].filter(Boolean).join("+");
  throw new Error(`PRO_VERIFICATION_REQUIRED:${missing}`);
}

/**
 * Phone-only verification gate. Pros must verify their mobile number before
 * posting jobs, unlocking leads, or contacting clients via messages.
 * Applies to both GB and NG. Does not affect client accounts.
 */
export async function requireProPhoneVerified(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<void> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("account_type, verified_phone")
    .eq("id", userId)
    .maybeSingle();
  const p = (prof ?? null) as { account_type?: string | null; verified_phone?: boolean } | null;
  if (p?.account_type !== "professional") return;
  if (p.verified_phone) return;
  throw new Error("PRO_PHONE_VERIFICATION_REQUIRED");
}

export const getMyProVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    return loadVerificationStatus(supabase as never, userId, claims as never);
  });
