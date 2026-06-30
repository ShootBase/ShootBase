import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(7)
    .max(32)
    .regex(/^[+\d][\d\s\-()]+$/i, "invalid_phone"),
});

const codeSchema = z.object({
  code: z.string().trim().regex(/^\d{4,8}$/),
  // The browser may pass the phone the user is verifying so Twilio's
  // VerificationCheck can match a pending verification when the profile
  // hasn't been updated yet. Falls back to the profile's stored phone.
  phone: z.string().trim().min(7).max(32).optional(),
});

/**
 * Send a Twilio Verify SMS code to the supplied phone number.
 *
 * Rate-limited to 5 sends per user per hour via the `client_phone_otps`
 * audit table (the code column stores a sentinel; Twilio Verify holds the
 * real OTP). On success the user's profile is updated with the normalised
 * E.164 number but `verified_phone` stays false until check succeeds.
 */
export const requestPhoneOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => phoneSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { toE164, startVerification } = await import("@/lib/twilio-verify.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    let e164: string;
    try { e164 = toE164(data.phone); }
    catch { throw new Error("invalid_phone"); }

    // Manual rate limit — 5 sends per rolling hour per user.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("client_phone_otps")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) throw new Error("rate_limited");

    // Send via Twilio Verify.
    await startVerification(e164);

    // Audit row + persist the (unverified) phone so the verify step knows
    // which number to check against if the client doesn't echo it back.
    await supabaseAdmin.from("client_phone_otps").insert({
      user_id: userId,
      phone: e164,
      code: "twilio",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    } as never);

    await supabaseAdmin
      .from("profiles")
      .update({ phone: e164, verified_phone: false, phone_verified_at: null } as never)
      .eq("id", userId);

    return { phone: e164, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
  });

/**
 * Verify a Twilio code. On success the profile is marked verified and the
 * audit row consumed.
 */
export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => codeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { toE164, checkVerification } = await import("@/lib/twilio-verify.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Prefer the phone the client just verified; fall back to the latest
    // pending audit row (which holds the normalised E.164 sent to Twilio).
    let e164: string | null = null;
    if (data.phone) {
      try { e164 = toE164(data.phone); } catch { /* fall through */ }
    }
    if (!e164) {
      const { data: row } = await supabaseAdmin
        .from("client_phone_otps")
        .select("phone")
        .eq("user_id", userId)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      e164 = (row as { phone?: string } | null)?.phone ?? null;
    }
    if (!e164) return { ok: false as const, error: "no_pending_code" };

    let result;
    try {
      result = await checkVerification(e164, data.code);
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "verify_failed" };
    }
    if (!result.valid) {
      if (result.status === "expired") return { ok: false as const, error: "expired" };
      return { ok: false as const, error: "invalid_code" };
    }

    await supabaseAdmin
      .from("profiles")
      .update({ phone: e164, verified_phone: true, phone_verified_at: new Date().toISOString() } as never)
      .eq("id", userId);

    await supabaseAdmin
      .from("client_phone_otps")
      .update({ consumed_at: new Date().toISOString() } as never)
      .eq("user_id", userId)
      .is("consumed_at", null);

    // If the caller is a Professional and their email is also verified, send
    // the one-shot account-verified confirmation email. Idempotency key on
    // userId means repeat verifications won't re-send.
    try {
      const claims = (context.claims ?? {}) as { email_verified?: boolean; amr?: { method?: string }[] };
      const isOAuth = (claims.amr ?? []).some((a) => a.method && a.method !== "password" && a.method !== "otp");
      const emailVerified = !!claims.email_verified || isOAuth;
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("account_type, full_name")
        .eq("id", userId)
        .maybeSingle();
      const p = (prof ?? null) as { account_type?: string | null; full_name?: string | null } | null;
      if (emailVerified && p?.account_type === "professional") {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
        const proEmail = u.user?.email ?? "";
        if (proEmail) {
          const { sendProVerifiedEmail } = await import("@/lib/pro-verified-email.server");
          await sendProVerifiedEmail({ userId, proEmail, proName: p.full_name ?? null });
        }
      }
    } catch (e) {
      console.warn("[verifyPhoneOtp] pro-verified email failed", e);
    }

    return { ok: true as const, phone: e164 };
  });

/**
 * Returns the current client's job-posting eligibility (email + phone
 * verification). Used by the dashboard banners and the Post-a-Job modal.
 */
export const getPostingEligibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const user = u.user;
    const providers = (user?.app_metadata?.providers ?? []) as string[];
    const isOAuth = providers.some((p) => p !== "email");
    const emailOk = !!user?.email_confirmed_at || isOAuth;

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("phone, verified_phone")
      .eq("id", context.userId)
      .maybeSingle();
    const phoneOk = !!(prof as { verified_phone?: boolean } | null)?.verified_phone;
    return {
      email_verified: emailOk,
      phone_verified: phoneOk,
      phone: (prof as { phone?: string } | null)?.phone ?? "",
      can_post: emailOk && phoneOk,
    };
  });

export const adminSetPhoneVerified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        verified: z.boolean(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "admin_set_phone_verified" as never,
      {
        _user_id: data.user_id,
        _verified: data.verified,
        _reason: data.reason ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
