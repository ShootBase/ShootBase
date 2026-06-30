import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, auditLog } from "./_guard";
import { assertRowInScope, resolveAdminCountry } from "./country.server";

function providerOf(u: any): string {
  const providers: string[] | undefined = u?.app_metadata?.providers;
  const provider: string | undefined = u?.app_metadata?.provider;
  const list = Array.isArray(providers) && providers.length ? providers : provider ? [provider] : [];
  if (!list.length) return "email";
  // Prefer non-email provider for display when account is linked
  const nonEmail = list.find((p) => p !== "email");
  return nonEmail ?? list[0];
}

/** Resolves the country a user belongs to (profile first, then professional). */
async function userCountry(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data: p } = await supabaseAdmin.from("profiles").select("country").eq("id", userId).maybeSingle();
  if (p?.country) return p.country;
  const { data: pro } = await supabaseAdmin.from("professionals").select("country").eq("user_id", userId).maybeSingle();
  return pro?.country ?? null;
}

async function assertUserInScope(supabase: any, supabaseAdmin: any, callerId: string, targetUserId: string) {
  const scope = await resolveAdminCountry(supabase, callerId);
  const c = await userCountry(supabaseAdmin, targetUserId);
  assertRowInScope(scope, c);
}


export const listPlatformUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().trim().max(200).optional(),
        type: z.enum(["all", "customer", "professional", "admin"]).default("all"),
        status: z.enum(["all", "active", "suspended"]).default("all"),
        tag: z.enum(["all", "vip", "high_spender", "risky", "inactive"]).default("all"),
        phone: z.enum(["all", "verified", "unverified"]).default("all"),
        page: z.number().int().min(1).default(1),
      })
      .parse(d ?? {}),
  )

  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const pageSize = 25;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // ---- Source of truth: auth.users (covers Google, Apple, Email — every provider) ----
    const allAuth: any[] = [];
    const perPage = 200;
    for (let p = 1; p <= 25; p++) {
      const { data: pageData, error } = await supabaseAdmin.auth.admin.listUsers({ page: p, perPage });
      if (error) throw new Error(error.message);
      const users = (pageData as any)?.users ?? [];
      allAuth.push(...users);
      if (users.length < perPage) break;
    }

    const ids = allAuth.map((u) => u.id);

    // ---- Enrichment (single round-trip per table) ----
    const inIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
    const [profilesRes, prosRes, rolesRes, staffRes, risksRes, tagsRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, phone, account_type, verified, verified_phone, created_at, country").in("id", inIds),
      supabaseAdmin.from("professionals").select("id, user_id, country").in("user_id", inIds),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", inIds),
      supabaseAdmin.from("staff_accounts").select("user_id, role, status").in("user_id", inIds),
      supabaseAdmin.from("user_risk_scores").select("user_id, score, level").in("user_id", inIds),
      supabaseAdmin.from("user_tags").select("user_id, tag, source").in("user_id", inIds),
    ]);


    const profileMap = new Map<string, any>();
    (profilesRes.data ?? []).forEach((r) => profileMap.set(r.id, r));

    const proByUser = new Map<string, string>();
    const proCountryByUser = new Map<string, string | null>();
    (prosRes.data ?? []).forEach((p: any) => {
      proByUser.set(p.user_id, p.id);
      proCountryByUser.set(p.user_id, p.country ?? null);
    });

    const proIds = Array.from(proByUser.values());
    const coinByPro = new Map<string, number>();
    if (proIds.length) {
      const { data: credits } = await supabaseAdmin
        .from("professional_credits")
        .select("professional_id, credit_balance")
        .in("professional_id", proIds);
      (credits ?? []).forEach((c) => coinByPro.set(c.professional_id, c.credit_balance ?? 0));
    }

    const rolesByUser = new Map<string, string[]>();
    (rolesRes.data ?? []).forEach((r) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    const staffByUser = new Map<string, { role: string; status: string }>();
    (staffRes.data ?? []).forEach((s) => staffByUser.set(s.user_id, { role: s.role, status: s.status }));

    const riskByUser = new Map<string, { score: number; level: string }>();
    (risksRes.data ?? []).forEach((r) => riskByUser.set(r.user_id, { score: r.score, level: r.level }));

    const tagsByUser = new Map<string, { tag: string; source: string }[]>();
    (tagsRes.data ?? []).forEach((t: any) => {
      const arr = tagsByUser.get(t.user_id) ?? [];
      arr.push({ tag: t.tag, source: t.source });
      tagsByUser.set(t.user_id, arr);
    });

    // ---- Project to a unified row, regardless of provider ----
    let rows = allAuth.map((u) => {
      const prof = profileMap.get(u.id);
      const proId = proByUser.get(u.id);
      const staff = staffByUser.get(u.id);
      const userRoles = rolesByUser.get(u.id) ?? [];
      const isAdmin = !!staff || userRoles.includes("admin");
      const accountType: string = staff
        ? staff.role
        : proId
          ? "professional"
          : prof?.account_type ?? "customer";
      return {
        id: u.id,
        full_name: prof?.full_name ?? (u.user_metadata?.full_name ?? u.user_metadata?.name ?? null),
        phone: prof?.phone ?? u.phone ?? null,
        email: u.email ?? null,
        provider: providerOf(u),
        account_type: accountType,
        country: prof?.country ?? proCountryByUser.get(u.id) ?? null,
        is_admin: isAdmin,
        roles: userRoles,
        verified: prof?.verified ?? !!u.email_confirmed_at,
        verified_phone: prof?.verified_phone ?? false,
        suspended: !!u.banned_until,
        last_sign_in_at: u.last_sign_in_at ?? null,
        created_at: u.created_at ?? prof?.created_at ?? null,
        coin_balance: proId ? coinByPro.get(proId) ?? 0 : null,
        risk: riskByUser.get(u.id) ?? null,
        tags: tagsByUser.get(u.id) ?? [],
      };
    });

    // ---- Country scoping ----
    if (scope.kind === "one") {
      rows = rows.filter((r) => (r.country ?? "United Kingdom") === scope.country);
    }

    // ---- Filters ----
    if (data.q) {
      const q = data.q.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.full_name ?? "").toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q) ||
          (r.phone ?? "").toLowerCase().includes(q),
      );
    }
    if (data.type !== "all") {
      if (data.type === "admin") rows = rows.filter((r) => r.is_admin);
      else rows = rows.filter((r) => r.account_type === data.type);
    }
    if (data.status === "active") rows = rows.filter((r) => !r.suspended);
    if (data.status === "suspended") rows = rows.filter((r) => r.suspended);
    if (data.tag !== "all") {
      rows = rows.filter((r) => r.tags.some((t) => t.tag === data.tag));
    }
    if (data.phone === "verified") rows = rows.filter((r) => r.verified_phone);
    if (data.phone === "unverified") rows = rows.filter((r) => !r.verified_phone);

    rows.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));


    const total = rows.length;
    const start = (data.page - 1) * pageSize;
    const paged = rows.slice(start, start + pageSize);

    return { rows: paged, total, pageSize };
  });



export const getUserDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertUserInScope(context.supabase, supabaseAdmin, context.userId, data.user_id);
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    const authUser: any = u?.user ?? null;
    const [{ data: profile }, { data: roles }, { data: pro }, { data: staff }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("id", data.user_id).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id),
        supabaseAdmin.from("professionals").select("id, business_name, status, is_verified").eq("user_id", data.user_id).maybeSingle(),
        supabaseAdmin.from("staff_accounts").select("role, status").eq("user_id", data.user_id).maybeSingle(),
      ]);
    let coin_balance: number | null = null;
    if (pro?.id) {
      const { data: c } = await supabaseAdmin
        .from("professional_credits")
        .select("credit_balance")
        .eq("professional_id", pro.id)
        .maybeSingle();
      coin_balance = c?.credit_balance ?? null;
    }
    const providersList: string[] =
      authUser?.app_metadata?.providers ??
      (authUser?.app_metadata?.provider ? [authUser.app_metadata.provider] : []);
    return {
      profile,
      email: authUser?.email ?? null,
      phone: authUser?.phone ?? profile?.phone ?? null,
      provider: providerOf(authUser),
      providers: providersList,
      suspended: !!authUser?.banned_until,
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
      created_at: authUser?.created_at ?? null,
      roles: (roles ?? []).map((r) => r.role),
      staff,
      professional: pro,
      coin_balance,
    };
  });

const suspendSchema = z.object({
  user_id: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export const suspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => suspendSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.suspend");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertUserInScope(context.supabase, supabaseAdmin, context.userId, data.user_id);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: "876000h",
    } as any);
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "user.suspend", "user", data.user_id, { reason: data.reason ?? null });
    return { ok: true };
  });

export const reactivateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.suspend");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertUserInScope(context.supabase, supabaseAdmin, context.userId, data.user_id);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: "none",
    } as any);
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "user.reactivate", "user", data.user_id, {});
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      reason: z.string().trim().min(3).max(500),
      confirm: z.literal("DELETE"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.delete");
    if (data.user_id === context.userId) throw new Error("You cannot delete yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertUserInScope(context.supabase, supabaseAdmin, context.userId, data.user_id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "user.delete", "user", data.user_id, { reason: data.reason });
    return { ok: true };
  });

// ---------- Bulk actions ----------

const bulkSchema = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(200),
  reason: z.string().trim().max(500).optional(),
});

export const bulkSuspendUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.suspend");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let ok = 0; let failed = 0;
    for (const uid of data.user_ids) {
      if (uid === context.userId) { failed++; continue; }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(uid, { ban_duration: "876000h" } as any);
      if (error) failed++;
      else {
        ok++;
        await auditLog(context.supabase, "user.suspend", "user", uid, { reason: data.reason ?? null, bulk: true });
      }
    }
    return { ok, failed };
  });

export const bulkReactivateUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.suspend");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let ok = 0; let failed = 0;
    for (const uid of data.user_ids) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(uid, { ban_duration: "none" } as any);
      if (error) failed++;
      else {
        ok++;
        await auditLog(context.supabase, "user.reactivate", "user", uid, { bulk: true });
      }
    }
    return { ok, failed };
  });

export const bulkDeleteUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_ids: z.array(z.string().uuid()).min(1).max(100),
      reason: z.string().trim().min(3).max(500),
      confirm: z.literal("DELETE"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.delete");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let ok = 0; let failed = 0;
    for (const uid of data.user_ids) {
      if (uid === context.userId) { failed++; continue; }
      const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (error) failed++;
      else {
        ok++;
        await auditLog(context.supabase, "user.delete", "user", uid, { reason: data.reason, bulk: true });
      }
    }
    return { ok, failed };
  });

// ---------- Contact user (opens a support thread from admin) ----------

export const contactUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      subject: z.string().trim().min(2).max(150),
      message: z.string().trim().min(2).max(4000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "tickets.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertUserInScope(context.supabase, supabaseAdmin, context.userId, data.user_id);
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("full_name").eq("id", data.user_id).maybeSingle();
    const { data: ticket, error } = await supabaseAdmin
      .from("support_requests")
      .insert({
        user_id: data.user_id,
        email: u?.user?.email ?? null,
        name: prof?.full_name ?? null,
        category: "admin_outreach",
        message: `[Admin outreach] ${data.subject}\n\n${data.message}`,
        status: "open",
        priority: "medium" as any,
        assigned_to: context.userId,
        assigned_by: context.userId,
        assigned_at: new Date().toISOString(),
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("admin_notes").insert({
      support_request_id: ticket.id,
      author_user_id: context.userId,
      body: data.message,
      is_public: true,
    } as any);
    await auditLog(context.supabase, "user.contact", "user", data.user_id, {
      ticket_id: ticket.id, subject: data.subject,
    });
    return { ok: true, ticket_id: ticket.id };
  });


export const verifyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid(), verified: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "verification.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertUserInScope(context.supabase, supabaseAdmin, context.userId, data.user_id);
    const { error } = await context.supabase
      .from("profiles")
      .update({ verified: data.verified })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "user.verify", "user", data.user_id, { verified: data.verified });
    return { ok: true };
  });

export const adjustUserCoins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        delta: z.number().int().min(-10000).max(10000),
        reason: z.string().trim().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "coins.adjust");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertUserInScope(context.supabase, supabaseAdmin, context.userId, data.user_id);
    const { data: pro } = await supabaseAdmin
      .from("professionals")
      .select("id")
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (!pro) throw new Error("User has no professional account");

    const { data: cur } = await supabaseAdmin
      .from("professional_credits")
      .select("credit_balance")
      .eq("professional_id", pro.id)
      .maybeSingle();
    const newBal = Math.max(0, (cur?.credit_balance ?? 0) + data.delta);
    await supabaseAdmin
      .from("professional_credits")
      .upsert({ professional_id: pro.id, credit_balance: newBal });
    await supabaseAdmin.from("credit_transactions").insert({
      professional_id: pro.id,
      amount: data.delta,
      transaction_type: "admin_adjustment",
      description: `Admin adjustment (${data.delta >= 0 ? "+" : ""}${data.delta}): ${data.reason}`,
    });
    await auditLog(context.supabase, "coins.adjust", "user", data.user_id, {
      delta: data.delta,
      reason: data.reason,
    });
    return { ok: true, balance: newBal };
  });

// ---------- Extended: activity, history, tickets, referrals, promos ----------

export const getUserActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: jobs }, { data: unlocks }, { data: msgs }, { data: user }] = await Promise.all([
      supabaseAdmin.from("jobs").select("id, title, status, created_at").eq("customer_id", data.user_id).order("created_at", { ascending: false }).limit(10),
      supabaseAdmin.from("lead_unlocks").select("id, job_id, created_at").eq("professional_id",
        (await supabaseAdmin.from("professionals").select("id").eq("user_id", data.user_id).maybeSingle()).data?.id ?? "00000000-0000-0000-0000-000000000000"
      ).order("created_at", { ascending: false }).limit(10),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).eq("sender_id", data.user_id),
      supabaseAdmin.auth.admin.getUserById(data.user_id),
    ]);
    return {
      jobs: jobs ?? [],
      unlocks: unlocks ?? [],
      message_count: (msgs as any)?.count ?? 0,
      last_sign_in_at: (user?.user as any)?.last_sign_in_at ?? null,
      created_at: (user?.user as any)?.created_at ?? null,
    };
  });

export const getUserCoinHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "coins.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pro } = await supabaseAdmin.from("professionals").select("id").eq("user_id", data.user_id).maybeSingle();
    if (!pro) return { rows: [] };
    const { data: rows } = await supabaseAdmin
      .from("credit_transactions")
      .select("id, amount, transaction_type, description, created_at")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false })
      .limit(100);
    return { rows: rows ?? [] };
  });

export const getUserTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "tickets.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("support_requests")
      .select("id, subject, status, priority, created_at")
      .eq("user_id", data.user_id)
      .order("created_at", { ascending: false })
      .limit(50);
    return { rows: rows ?? [] };
  });

export const getUserReferralAndPromos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: codes }, { data: redemptions }] = await Promise.all([
      supabaseAdmin.from("referral_codes").select("*").eq("owner_user_id", data.user_id).order("created_at", { ascending: false }),
      supabaseAdmin
        .from("promo_redemptions")
        .select("id, redeemed_at, promo_code:promo_codes(code, discount_type, discount_value)")
        .eq("user_id", data.user_id)
        .order("redeemed_at", { ascending: false })
        .limit(50),
    ]);
    return { referral_codes: codes ?? [], redemptions: redemptions ?? [] };
  });

function randomCode(prefix: string, len = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}${s}`;
}

export const createReferralCodeForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      reward_for_referrer: z.number().int().min(0).max(10000).default(0),
      reward_for_referee: z.number().int().min(0).max(10000).default(0),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "settings.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = randomCode("REF-");
    const { error } = await supabaseAdmin.from("referral_codes").insert({
      code,
      owner_user_id: data.user_id,
      kind: "user",
      reward_for_referrer: data.reward_for_referrer,
      reward_for_referee: data.reward_for_referee,
    });
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "referral.create", "user", data.user_id, { code });
    return { ok: true, code };
  });

// ---------- Permanent ban (blocks email from re-registering) ----------

const banSchema = z.object({
  user_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  confirm: z.literal("BAN"),
});

export const banUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => banSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.delete");
    if (data.user_id === context.userId) throw new Error("You cannot ban yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertUserInScope(context.supabase, supabaseAdmin, context.userId, data.user_id);
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    const email = u?.user?.email?.toLowerCase();
    if (!email) throw new Error("This account has no email to ban");
    const country = await userCountry(supabaseAdmin, data.user_id);
    const { error: insErr } = await supabaseAdmin
      .from("banned_emails")
      .upsert(
        { email, reason: data.reason, banned_by: context.userId, country, banned_at: new Date().toISOString() },
        { onConflict: "email" },
      );
    if (insErr) throw new Error(insErr.message);
    // Remove the auth user so they can no longer sign in. The banned_emails
    // row blocks any future re-registration with the same email.
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (delErr) throw new Error(delErr.message);
    await auditLog(context.supabase, "user.ban", "user", data.user_id, { reason: data.reason, email });
    return { ok: true };
  });

export const unbanEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.delete");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const { error } = await supabaseAdmin.from("banned_emails").delete().eq("email", email);
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "user.unban", "user", email, {});
    return { ok: true };
  });

export const listBannedEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    let q = supabaseAdmin
      .from("banned_emails")
      .select("email, reason, banned_by, banned_at, country")
      .order("banned_at", { ascending: false });
    if (scope.kind === "one") q = q.eq("country", scope.country);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

