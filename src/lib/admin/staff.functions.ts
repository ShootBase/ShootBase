import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, auditLog } from "./_guard";
import { STAFF_PERMISSIONS, STAFF_ROLES, ROLE_LABEL, type StaffRole } from "./permissions";
import { createHash, randomBytes } from "crypto";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const SITE_ORIGIN = "https://www.shootbase.co.uk";

function siteOrigin() {
  return process.env.SITE_URL || SITE_ORIGIN;
}

/**
 * Enforce that the caller may act on `targetUserId`'s staff record.
 * - Super Admins can touch anyone.
 * - A country-scoped admin can only touch staff with the same `country`.
 * - A country-scoped admin can never touch a Super Admin (country = NULL).
 */
async function assertStaffInScope(
  supabase: any,
  callerId: string,
  targetUserId: string,
): Promise<void> {
  const { data: callerRole } = await supabase.rpc("staff_role_of", { _uid: callerId });
  if (callerRole === "super_admin") return;
  const { data: callerCountry } = await supabase.rpc("staff_country_of", { _uid: callerId });
  const { data: targetCountry } = await supabase.rpc("staff_country_of", { _uid: targetUserId });
  if (!callerCountry) throw new Error("Forbidden: caller has no country scope");
  if (!targetCountry) {
    throw new Error("Forbidden: only Super Admin can manage global staff");
  }
  if (callerCountry !== targetCountry) {
    throw new Error("Forbidden: staff member is in another country");
  }
}


export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "staff.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: staff, error } = await supabaseAdmin
      .from("staff_accounts")
      .select("user_id, role, status, country, invited_at, activated_at, last_login_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (staff ?? []).map((s) => s.user_id);
    const emails: Record<string, string> = {};
    const names: Record<string, string | null> = {};
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      for (const p of profs ?? []) names[p.id] = p.full_name ?? null;
      // emails via admin
      for (const id of ids) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        if (u?.user?.email) emails[id] = u.user.email;
      }
    }

    const { data: invites } = await supabaseAdmin
      .from("staff_invites")
      .select(
        "id, email, role, country, expires_at, consumed_at, created_at, invited_by, email_status, email_last_error, email_sent_at, email_attempts",
      )
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    return {
      staff: (staff ?? []).map((s) => ({
        ...s,
        email: emails[s.user_id] ?? "—",
        full_name: names[s.user_id] ?? null,
      })),
      invites: invites ?? [],
    };
  });

export const getStaffPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "staff.manage");
    const { data: overrides, error } = await context.supabase
      .from("staff_permission_overrides")
      .select("permission, effect")
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { overrides: overrides ?? [] };
  });

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(STAFF_ROLES),
  country: z.string().trim().min(2).max(80).nullable().optional(),
  overrides: z
    .array(z.object({ permission: z.enum(STAFF_PERMISSIONS), effect: z.enum(["allow", "deny"]) }))
    .default([]),
});

/**
 * Generates a magic sign-in link for the invitee and enqueues a branded
 * staff-invite email through the project's own transactional email queue.
 *
 * This intentionally bypasses Supabase's `inviteUserByEmail`, which silently
 * no-ops for already-registered emails (no email is ever sent) and has been
 * the root cause of the "invite created but no email arrives" bug.
 */
async function dispatchInviteEmail(params: {
  supabaseAdmin: any;
  inviteId: string;
  email: string;
  role: StaffRole;
  token: string;
  inviterUserId: string;
  expiresAt: string;
  attempt: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabaseAdmin } = params;
  const origin = siteOrigin();
  const targetUrl = `${origin}/staff/accept?token=${params.token}`;

  // Best-effort: generate a magic-link so the invitee is signed in when they
  // land on /staff/accept. Falls back to inviting (which creates the user) if
  // the user doesn't yet exist. Either way the final URL goes to /staff/accept.
  let acceptUrl = targetUrl;
  try {
    const { data: gen, error: genErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: params.email,
      options: { redirectTo: targetUrl },
    });
    if (!genErr && gen?.properties?.action_link) {
      acceptUrl = gen.properties.action_link;
    } else {
      const { data: gen2 } = await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email: params.email,
        options: { redirectTo: targetUrl, data: { staff_invite: true } },
      });
      if (gen2?.properties?.action_link) acceptUrl = gen2.properties.action_link;
    }
  } catch (e) {
    console.warn("[staff-invite] generateLink failed, using direct accept URL", e);
  }

  // Resolve inviter name for the email body.
  let inviterName: string | null = null;
  try {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", params.inviterUserId)
      .maybeSingle();
    inviterName = prof?.full_name ?? null;
  } catch {}

  const { enqueueStaffInviteEmail } = await import("@/lib/staff-invite-email.server");
  const result = await enqueueStaffInviteEmail({
    inviteId: params.inviteId,
    recipientEmail: params.email,
    acceptUrl,
    roleLabel: ROLE_LABEL[params.role],
    inviterName,
    expiresAt: params.expiresAt,
    attempt: params.attempt,
  });

  await supabaseAdmin
    .from("staff_invites")
    .update({
      email_status: result.ok ? "sent" : "failed",
      email_last_error: result.ok ? null : (result.error ?? "Unknown email error"),
      email_sent_at: result.ok ? new Date().toISOString() : null,
      email_attempts: params.attempt,
    })
    .eq("id", params.inviteId);

  return result;
}

export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "staff.manage");
    const { data: callerRole } = await context.supabase.rpc("staff_role_of", { _uid: context.userId });
    if (data.role === "super_admin" && callerRole !== "super_admin") {
      throw new Error("Only Super Admin can invite a Super Admin");
    }
    // Country Admins can only invite Staff within their own country.
    let country: string | null = data.country?.trim() || null;
    if (callerRole !== "super_admin") {
      const { resolveAdminCountry } = await import("./country.server");
      const scope = await resolveAdminCountry(context.supabase, context.userId);
      if (scope.kind !== "one") throw new Error("Insufficient country scope to invite staff");
      country = scope.country;
      if (data.role === "country_admin" || data.role === "super_admin") {
        throw new Error("Only Super Admin can invite Country Admins or Super Admins");
      }
    }
    if (data.role !== "super_admin" && !country) {
      throw new Error("Country is required for Country Admin and Staff invites");
    }
    if (data.role === "super_admin") country = null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const email = data.email.toLowerCase();

    const { data: inviteRow, error: insErr } = await supabaseAdmin
      .from("staff_invites")
      .insert({
        email,
        role: data.role,
        country,
        token_hash: tokenHash,
        permission_overrides: data.overrides as any,
        invited_by: context.userId,
        email_status: "pending",
        email_attempts: 0,
      })
      .select("id, expires_at")
      .single();
    if (insErr) throw new Error(insErr.message);

    const send = await dispatchInviteEmail({
      supabaseAdmin,
      inviteId: inviteRow.id,
      email,
      role: data.role,
      token,
      inviterUserId: context.userId,
      expiresAt: inviteRow.expires_at,
      attempt: 1,
    });

    await auditLog(
      context.supabase,
      send.ok ? "staff.invite" : "staff.invite.email_failed",
      "staff",
      email,
      { role: data.role, overrides: data.overrides, email_error: send.error ?? null },
    );

    if (!send.ok) {
      // Surface the failure to the admin so they can retry; the invite row
      // remains so they can resend without re-typing details.
      throw new Error(`Invite created but email failed to send: ${send.error}`);
    }
    return { ok: true, invite_id: inviteRow.id };
  });

const resendSchema = z.object({ invite_id: z.string().uuid() });

export const resendStaffInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resendSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "staff.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error } = await supabaseAdmin
      .from("staff_invites")
      .select("id, email, role, expires_at, consumed_at, email_attempts")
      .eq("id", data.invite_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Invite not found");
    if (invite.consumed_at) throw new Error("Invite already accepted");
    if (new Date(invite.expires_at) < new Date()) throw new Error("Invite has expired");

    // Rotate the token so any previous link is invalidated.
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("staff_invites")
      .update({ token_hash: tokenHash, expires_at: newExpires, email_status: "pending" })
      .eq("id", invite.id);

    const attempt = (invite.email_attempts ?? 0) + 1;
    const send = await dispatchInviteEmail({
      supabaseAdmin,
      inviteId: invite.id,
      email: invite.email,
      role: invite.role as StaffRole,
      token,
      inviterUserId: context.userId,
      expiresAt: newExpires,
      attempt,
    });
    await auditLog(
      context.supabase,
      send.ok ? "staff.invite.resend" : "staff.invite.email_failed",
      "staff",
      invite.email,
      { email_error: send.error ?? null, attempt },
    );
    if (!send.ok) throw new Error(send.error ?? "Email failed to send");
    return { ok: true };
  });

export const revokeStaffInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resendSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "staff.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("staff_invites")
      .select("email")
      .eq("id", data.invite_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Invite not found");
    await supabaseAdmin.from("staff_invites").delete().eq("id", data.invite_id);
    await auditLog(context.supabase, "staff.invite.revoke", "staff", invite.email, {});
    return { ok: true };
  });

const acceptSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8).max(128),
});

export const acceptStaffInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => acceptSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tokenHash = hashToken(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error: invErr } = await supabaseAdmin
      .from("staff_invites")
      .select("id, email, role, country, permission_overrides, expires_at, consumed_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!invite) throw new Error("Invalid or expired invite");
    if (invite.consumed_at) throw new Error("Invite already used");
    if (new Date(invite.expires_at) < new Date()) throw new Error("Invite expired");

    // Verify the calling user matches the invite email
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const userEmail = userRes?.user?.email?.toLowerCase();
    if (!userEmail || userEmail !== invite.email.toLowerCase()) {
      throw new Error("This invite is not for your account");
    }

    // Set password
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (pwErr) throw new Error(pwErr.message);

    // Create staff_accounts row
    const { error: saErr } = await supabaseAdmin
      .from("staff_accounts")
      .upsert({
        user_id: context.userId,
        role: invite.role,
        country: invite.role === "super_admin" ? null : ((invite as any).country ?? null),
        status: "active",
        activated_at: new Date().toISOString(),
      });
    if (saErr) throw new Error(saErr.message);

    // Apply permission overrides
    const overrides = (invite.permission_overrides as any[]) ?? [];
    if (overrides.length) {
      const rows = overrides.map((o) => ({
        user_id: context.userId,
        permission: o.permission,
        effect: o.effect,
      }));
      await supabaseAdmin.from("staff_permission_overrides").upsert(rows);
    }

    await supabaseAdmin
      .from("staff_invites")
      .update({ consumed_at: new Date().toISOString(), consumed_by: context.userId })
      .eq("id", invite.id);

    await auditLog(context.supabase, "staff.invite.accept", "staff", context.userId, {
      role: invite.role,
    });

    return { ok: true };
  });

const updateRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(STAFF_ROLES),
});

export const updateStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateRoleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "staff.manage");
    const { data: callerRole } = await context.supabase.rpc("staff_role_of", { _uid: context.userId });
    if (data.role === "super_admin" && callerRole !== "super_admin") {
      throw new Error("Only Super Admin can grant Super Admin");
    }
    if (data.user_id === context.userId && data.role !== "super_admin") {
      throw new Error("You cannot demote yourself");
    }
    await assertStaffInScope(context.supabase, context.userId, data.user_id);

    const { error } = await context.supabase
      .from("staff_accounts")
      .update({ role: data.role })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "staff.role.update", "staff", data.user_id, { role: data.role });
    return { ok: true };
  });

const overrideSchema = z.object({
  user_id: z.string().uuid(),
  overrides: z.array(
    z.object({ permission: z.enum(STAFF_PERMISSIONS), effect: z.enum(["allow", "deny"]) }),
  ),
});

export const updateStaffPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => overrideSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "staff.manage");
    await assertStaffInScope(context.supabase, context.userId, data.user_id);
    await context.supabase.from("staff_permission_overrides").delete().eq("user_id", data.user_id);
    if (data.overrides.length) {
      const rows = data.overrides.map((o) => ({
        user_id: data.user_id,
        permission: o.permission,
        effect: o.effect,
      }));
      const { error } = await context.supabase.from("staff_permission_overrides").insert(rows);
      if (error) throw new Error(error.message);
    }
    await auditLog(context.supabase, "staff.permissions.update", "staff", data.user_id, {
      overrides: data.overrides,
    });
    return { ok: true };
  });

const suspendSchema = z.object({ user_id: z.string().uuid() });

export const suspendStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => suspendSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "staff.manage");
    if (data.user_id === context.userId) throw new Error("You cannot suspend yourself");
    await assertStaffInScope(context.supabase, context.userId, data.user_id);
    const { error } = await context.supabase
      .from("staff_accounts")
      .update({ status: "suspended" })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    // Also revoke active auth sessions so suspension is effective immediately.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, { ban_duration: "876000h" });
    } catch {/* noop */}
    await auditLog(context.supabase, "staff.suspend", "staff", data.user_id, {});
    return { ok: true };
  });

export const reactivateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => suspendSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "staff.manage");
    await assertStaffInScope(context.supabase, context.userId, data.user_id);
    const { error } = await context.supabase
      .from("staff_accounts")
      .update({ status: "active" })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, { ban_duration: "none" });
    } catch {/* noop */}
    await auditLog(context.supabase, "staff.reactivate", "staff", data.user_id, {});
    return { ok: true };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => suspendSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "staff.manage");
    if (data.user_id === context.userId) throw new Error("You cannot delete yourself");
    await assertStaffInScope(context.supabase, context.userId, data.user_id);
    const { error } = await context.supabase
      .from("staff_accounts")
      .delete()
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    // Permanently remove the auth identity so they're fully signed out.
    // (The email remains free to register a new ShootBase account unless
    // they were banned via banStaff/banUser.)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    } catch {/* noop */}
    await auditLog(context.supabase, "staff.delete", "staff", data.user_id, {});
    return { ok: true };
  });

const banStaffSchema = z.object({
  user_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  confirm: z.literal("BAN"),
});

export const banStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => banStaffSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "staff.manage");
    if (data.user_id === context.userId) throw new Error("You cannot ban yourself");
    await assertStaffInScope(context.supabase, context.userId, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    const email = u?.user?.email?.toLowerCase();
    if (!email) throw new Error("Staff account has no email to ban");
    const { data: targetCountry } = await context.supabase.rpc("staff_country_of", { _uid: data.user_id });
    const { error: insErr } = await supabaseAdmin
      .from("banned_emails")
      .upsert(
        { email, reason: data.reason, banned_by: context.userId, country: targetCountry ?? null, banned_at: new Date().toISOString() },
        { onConflict: "email" },
      );
    if (insErr) throw new Error(insErr.message);
    await supabaseAdmin.from("staff_accounts").delete().eq("user_id", data.user_id);
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (delErr) throw new Error(delErr.message);
    await auditLog(context.supabase, "staff.ban", "staff", data.user_id, { reason: data.reason, email });
    return { ok: true };
  });

const resetSchema = z.object({ user_id: z.string().uuid() });

export const sendStaffPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "staff.manage");
    await assertStaffInScope(context.supabase, context.userId, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    const email = u?.user?.email;
    if (!email) throw new Error("User has no email");
    const origin = process.env.SITE_URL || "https://www.shootbase.co.uk";
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${origin}/reset-password` },
    });
    if (error) throw new Error(error.message);
    // Ensure the email is actually delivered: enqueue via our transactional
    // email queue (the same queue all platform emails use).
    try {
      const action_link = (link as any)?.properties?.action_link;
      if (action_link) {
        await supabaseAdmin.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            template_name: "staff-password-reset",
            recipient_email: email,
            subject: "Reset your ShootBase password",
            html: `<p>Hi,</p><p>A password reset was requested for your ShootBase staff account.</p><p><a href="${action_link}">Click here to reset your password</a>. This link expires in 1 hour.</p><p>If you didn't request this, you can safely ignore this email.</p><p>— Shootbase Support</p>`,
            from_name: "Shootbase Support",
            from_address: "support@shootbase.co.uk",
            reply_to: "support@shootbase.co.uk",
            sender_domain: "notify.shootbase.co.uk",
            idempotency_key: `staff-pwd-reset-${data.user_id}-${Date.now()}`,
            metadata: { user_id: data.user_id },
          },
        });
      }
    } catch (e) { console.warn("[staff-password-reset] enqueue failed", e); }

    await auditLog(context.supabase, "staff.password_reset", "staff", data.user_id, {});
    return { ok: true };
  });

