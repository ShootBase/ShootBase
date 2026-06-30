import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAdminCountry } from "./country.server";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _uid: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

type ListInput = {
  q?: string;
  status?: "all" | "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "paused" | "unpaid";
  renewingOnly?: boolean;
  environment?: "all" | "sandbox" | "live";
  page?: number;
};

export const getSubscriptionsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("credit_subscriptions")
      .select("status, credits_per_period, current_period_end, cancel_at_period_end, environment, created_at, country");
    if (scope.kind === "one") q = q.eq("country", scope.country);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const all = rows ?? [];
    const now = Date.now();
    const in7 = now + 7 * 24 * 60 * 60 * 1000;
    const since24 = now - 24 * 60 * 60 * 1000;

    const active = all.filter((r: any) => r.status === "active").length;
    const trialing = all.filter((r: any) => r.status === "trialing").length;
    const pastDue = all.filter((r: any) => r.status === "past_due").length;
    const canceled = all.filter((r: any) => r.status === "canceled").length;
    const cancelingAtPeriodEnd = all.filter((r: any) => r.cancel_at_period_end === true && r.status !== "canceled").length;
    const renewingSoon = all.filter(
      (r: any) =>
        r.current_period_end &&
        !r.cancel_at_period_end &&
        (r.status === "active" || r.status === "trialing") &&
        new Date(r.current_period_end).getTime() <= in7,
    ).length;
    const newLast24h = all.filter((r: any) => new Date(r.created_at).getTime() >= since24).length;
    const totalCoinsPerPeriod = all
      .filter((r: any) => r.status === "active" || r.status === "trialing")
      .reduce((s: number, r: any) => s + (r.credits_per_period ?? 0), 0);

    return {
      total: all.length,
      active,
      trialing,
      pastDue,
      canceled,
      cancelingAtPeriodEnd,
      renewingSoon,
      newLast24h,
      totalCoinsPerPeriod,
    };
  });

export const listSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ListInput) => d)
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const page = Math.max(1, data.page ?? 1);
    const pageSize = 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabaseAdmin
      .from("credit_subscriptions")
      .select(
        "id, professional_id, stripe_customer_id, stripe_subscription_id, price_id, status, credits_per_period, current_period_end, cancel_at_period_end, environment, created_at, updated_at, country",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false });

    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.environment && data.environment !== "all") q = q.eq("environment", data.environment);
    if (data.renewingOnly) q = q.eq("cancel_at_period_end", false);
    if (scope.kind === "one") q = q.eq("country", scope.country);

    const { data: rows, count, error } = await q.range(from, to);
    if (error) throw new Error(error.message);

    const proIds = Array.from(new Set((rows ?? []).map((r: any) => r.professional_id).filter(Boolean)));
    const proMap: Record<string, { user_id: string | null; business_name: string | null }> = {};
    if (proIds.length) {
      const { data: pros } = await supabaseAdmin
        .from("professionals")
        .select("id, user_id, business_name")
        .in("id", proIds);
      for (const p of pros ?? []) proMap[p.id] = { user_id: p.user_id, business_name: p.business_name };
    }
    const userIds = Array.from(new Set(Object.values(proMap).map((p) => p.user_id).filter(Boolean))) as string[];
    const nameMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds);
      for (const p of profs ?? []) nameMap[p.id] = { full_name: p.full_name, email: null };
      for (const uid of userIds) {
        try {
          const { data: u } = await (supabaseAdmin as any).auth.admin.getUserById(uid);
          if (u?.user) nameMap[uid] = { full_name: nameMap[uid]?.full_name ?? null, email: u.user.email ?? null };
        } catch {}
      }
    }

    let enriched = (rows ?? []).map((r: any) => {
      const pro = r.professional_id ? proMap[r.professional_id] : null;
      const user = pro?.user_id ? nameMap[pro.user_id] : null;
      return {
        ...r,
        business_name: pro?.business_name ?? null,
        phone: null,
        user_id: pro?.user_id ?? null,
        user_name: user?.full_name ?? null,
        user_email: user?.email ?? null,
      };
    });

    if (data.q) {
      const needle = data.q.toLowerCase();
      enriched = enriched.filter(
        (r) =>
          (r.business_name ?? "").toLowerCase().includes(needle) ||
          (r.user_name ?? "").toLowerCase().includes(needle) ||
          (r.user_email ?? "").toLowerCase().includes(needle) ||
          (r.price_id ?? "").toLowerCase().includes(needle) ||
          (r.stripe_customer_id ?? "").toLowerCase().includes(needle) ||
          (r.stripe_subscription_id ?? "").toLowerCase().includes(needle),
      );
    }

    return { rows: enriched, total: count ?? 0, pageSize, page };
  });
