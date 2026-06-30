import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAdminCountry } from "./country.server";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _uid: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const getCoinsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const scoped = <T extends { eq: (c: string, v: any) => T }>(q: T): T =>
      scope.kind === "one" ? q.eq("country", scope.country) : q;

    const [{ data: circ }, { data: txAll }, { data: tx24 }, { data: tx7 }, { data: tx30 }] = await Promise.all([
      scoped(supabaseAdmin.from("professional_credits").select("credit_balance")),
      scoped(supabaseAdmin.from("credit_transactions").select("amount, transaction_type")),
      scoped(supabaseAdmin.from("credit_transactions").select("amount, transaction_type")).gte("created_at", since24),
      scoped(supabaseAdmin.from("credit_transactions").select("amount, transaction_type")).gte("created_at", since7),
      scoped(supabaseAdmin.from("credit_transactions").select("amount, transaction_type")).gte("created_at", since30),
    ]);

    const inCirculation = (circ ?? []).reduce((s: number, r: any) => s + (r.credit_balance ?? 0), 0);

    const bucket = (rows: any[] | null) => {
      const r = rows ?? [];
      const purchased = r.filter((x) => x.transaction_type === "credit_purchase").reduce((s, x) => s + (x.amount ?? 0), 0);
      const adminAdded = r
        .filter((x) => x.transaction_type === "admin_adjustment" && (x.amount ?? 0) > 0)
        .reduce((s, x) => s + x.amount, 0);
      const adminRemoved = r
        .filter((x) => x.transaction_type === "admin_adjustment" && (x.amount ?? 0) < 0)
        .reduce((s, x) => s + Math.abs(x.amount), 0);
      const welcome = r.filter((x) => x.transaction_type === "welcome_bonus").reduce((s, x) => s + (x.amount ?? 0), 0);
      const spent = r
        .filter((x) => x.transaction_type === "lead_unlock")
        .reduce((s, x) => s + Math.abs(x.amount ?? 0), 0);
      return { purchased, adminAdded, adminRemoved, welcome, spent, net: purchased + adminAdded + welcome - spent - adminRemoved };
    };

    return {
      inCirculation,
      lifetime: bucket(txAll),
      last24h: bucket(tx24),
      last7d: bucket(tx7),
      last30d: bucket(tx30),
    };
  });

type ListInput = {
  q?: string;
  type?: "all" | "credit_purchase" | "admin_adjustment" | "lead_unlock" | "welcome_bonus" | "refund";
  page?: number;
};

export const listCoinTransactions = createServerFn({ method: "GET" })
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
      .from("credit_transactions")
      .select("id, professional_id, amount, transaction_type, description, created_at", { count: "exact" })
      .order("created_at", { ascending: false });

    if (data.type && data.type !== "all") q = q.eq("transaction_type", data.type);
    if (scope.kind === "one") q = q.eq("country", scope.country);

    const { data: rows, count, error } = await q.range(from, to);
    if (error) throw new Error(error.message);

    // Resolve pro -> user -> profile
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
          (r.description ?? "").toLowerCase().includes(needle),
      );
    }

    return { rows: enriched, total: count ?? 0, pageSize, page };
  });
