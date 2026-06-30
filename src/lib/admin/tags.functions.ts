import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, auditLog } from "./_guard";
import { resolveAdminCountry, assertRowInScope } from "./country.server";

async function assertUserInScope(supabase: any, userId: string, targetUserId: string) {
  const scope = await resolveAdminCountry(supabase, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: p } = await supabaseAdmin.from("profiles").select("country").eq("id", targetUserId).maybeSingle();
  assertRowInScope(scope, (p as any)?.country);
  return scope;
}

const TAGS = ["vip", "high_spender", "risky", "inactive"] as const;
export type UserTag = (typeof TAGS)[number];

export const listUserTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    await assertUserInScope(context.supabase, context.userId, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("user_tags")
      .select("tag, source, reason, granted_at, granted_by")
      .eq("user_id", data.user_id)
      .order("granted_at", { ascending: false });
    return { rows: rows ?? [] };
  });

export const setUserTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      tag: z.enum(TAGS),
      reason: z.string().trim().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.edit");
    await assertUserInScope(context.supabase, context.userId, data.user_id);
    const { error } = await context.supabase.rpc("admin_set_user_tag", {
      _user_id: data.user_id, _tag: data.tag, _reason: data.reason ?? "",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeUserTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), tag: z.enum(TAGS) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.edit");
    await assertUserInScope(context.supabase, context.userId, data.user_id);
    const { error } = await context.supabase.rpc("admin_remove_user_tag", {
      _user_id: data.user_id, _tag: data.tag,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recomputeUserTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    await assertUserInScope(context.supabase, context.userId, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("recompute_user_tags", { _user_id: data.user_id });
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "user.tags.recompute", "user", data.user_id, {});
    return { ok: true };
  });

export const recomputeAllUserTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "settings.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("recompute_all_user_tags");
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "user.tags.recompute_all", null, null, { processed: data });
    return { processed: data as unknown as number };
  });

// ---------- VIP dashboard ----------

export const listVipUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tagged } = await supabaseAdmin
      .from("user_tags")
      .select("user_id, source, reason, granted_at")
      .eq("tag", "vip");
    const candidateIds = (tagged ?? []).map((r) => r.user_id);
    // Restrict to users in scope
    const { data: scopedProfiles } = candidateIds.length
      ? await supabaseAdmin.from("profiles").select("id").in("id", candidateIds).eq("country", scope.country)
      : { data: [] as any[] };
    const scopedSet = new Set((scopedProfiles ?? []).map((p: any) => p.id));
    const vipIds = candidateIds.filter((id) => scopedSet.has(id));

    if (vipIds.length === 0) {
      return { vip_count: 0, rewards_total_coins: 0, users: [], recent_rewards: [] };
    }

    // Profiles + pros + sums (last 90d) for each VIP
    const [profilesRes, prosRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name").in("id", vipIds),
      supabaseAdmin.from("professionals").select("id, user_id, business_name").in("user_id", vipIds),
    ]);
    const profMap = new Map<string, any>();
    (profilesRes.data ?? []).forEach((p) => profMap.set(p.id, p));
    const proByUser = new Map<string, { id: string; business_name: string | null }>();
    (prosRes.data ?? []).forEach((p) => proByUser.set(p.user_id, { id: p.id, business_name: p.business_name }));

    const proIds = Array.from(proByUser.values()).map((p) => p.id);
    const spendByPro = new Map<string, number>();
    if (proIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("credit_transactions")
        .select("professional_id, amount, transaction_type, created_at")
        .in("professional_id", proIds)
        .gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString())
        .gt("amount", 0);
      (txs ?? []).forEach((t: any) => {
        if (["purchase", "subscription", "top_up"].includes(t.transaction_type)) {
          spendByPro.set(t.professional_id, (spendByPro.get(t.professional_id) ?? 0) + (t.amount ?? 0));
        }
      });
    }

    // Get auth email for each
    const emailById = new Map<string, string | null>();
    await Promise.all(vipIds.map(async (uid) => {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
      emailById.set(uid, (u?.user as any)?.email ?? null);
    }));

    const users = vipIds.map((uid) => {
      const pro = proByUser.get(uid);
      return {
        user_id: uid,
        full_name: profMap.get(uid)?.full_name ?? null,
        email: emailById.get(uid),
        business_name: pro?.business_name ?? null,
        coins_purchased_90d: pro ? (spendByPro.get(pro.id) ?? 0) : 0,
        source: (tagged ?? []).find((r) => r.user_id === uid)?.source ?? "auto",
        granted_at: (tagged ?? []).find((r) => r.user_id === uid)?.granted_at ?? null,
      };
    }).sort((a, b) => b.coins_purchased_90d - a.coins_purchased_90d);

    const { data: rewards } = vipIds.length
      ? await supabaseAdmin
          .from("vip_rewards")
          .select("id, user_id, reward_type, coins, promo_code, note, granted_at, granted_by")
          .in("user_id", vipIds)
          .order("granted_at", { ascending: false })
          .limit(50)
      : { data: [] as any[] };

    const rewards_total_coins = (rewards ?? []).reduce((s, r: any) => s + (r.coins ?? 0), 0);

    return {
      vip_count: users.length,
      rewards_total_coins,
      users,
      recent_rewards: rewards ?? [],
    };
  });

export const grantVipReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      reward_type: z.enum(["coin_bonus", "discount_code", "perk", "other"]),
      coins: z.number().int().min(0).max(10000).default(0),
      promo_code: z.string().trim().max(50).optional(),
      note: z.string().trim().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "coins.adjust");
    await assertUserInScope(context.supabase, context.userId, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Block VIP rewards for risky users
    const { data: risky } = await supabaseAdmin
      .from("user_tags")
      .select("tag")
      .eq("user_id", data.user_id)
      .eq("tag", "risky")
      .maybeSingle();
    if (risky) throw new Error("Cannot reward a risky user");

    // If coin bonus, credit the professional's coin balance
    if (data.reward_type === "coin_bonus" && data.coins > 0) {
      const { data: pro } = await supabaseAdmin
        .from("professionals").select("id").eq("user_id", data.user_id).maybeSingle();
      if (!pro) throw new Error("User has no professional account to credit");
      const { data: cur } = await supabaseAdmin
        .from("professional_credits")
        .select("credit_balance").eq("professional_id", pro.id).maybeSingle();
      const newBal = (cur?.credit_balance ?? 0) + data.coins;
      await supabaseAdmin
        .from("professional_credits")
        .upsert({ professional_id: pro.id, credit_balance: newBal });
      await supabaseAdmin.from("credit_transactions").insert({
        professional_id: pro.id,
        amount: data.coins,
        transaction_type: "admin_adjustment",
        description: `VIP bonus: ${data.note ?? "thank you for being a top user"}`,
      });
    }

    const { error } = await supabaseAdmin.from("vip_rewards").insert({
      user_id: data.user_id,
      reward_type: data.reward_type,
      coins: data.coins,
      promo_code: data.promo_code ?? null,
      note: data.note ?? null,
      granted_by: context.userId,
    });
    if (error) throw new Error(error.message);

    await auditLog(context.supabase, "vip.reward.grant", "user", data.user_id, {
      reward_type: data.reward_type, coins: data.coins,
    });
    return { ok: true };
  });
