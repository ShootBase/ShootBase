import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAdminCountry } from "./country.server";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staff_role_of", { _uid: userId });
  if (error) throw new Error(error.message);
  if (data !== "super_admin") throw new Error("Forbidden");
}

type Range = "24h" | "7d" | "30d" | "custom";
type Input = { range: Range; from?: string; to?: string; bucket?: "hour" | "day" | "week" };

function resolveWindow(input: Input): { from: Date; to: Date; bucket: "hour" | "day" | "week" } {
  const to = input.to ? new Date(input.to) : new Date();
  let from: Date;
  let bucket: "hour" | "day" | "week";
  switch (input.range) {
    case "24h":
      from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
      bucket = "hour";
      break;
    case "7d":
      from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      bucket = "day";
      break;
    case "30d":
      from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      bucket = "day";
      break;
    case "custom":
      from = input.from ? new Date(input.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      const span = to.getTime() - from.getTime();
      bucket = span <= 2 * 24 * 60 * 60 * 1000 ? "hour" : span <= 60 * 24 * 60 * 60 * 1000 ? "day" : "week";
      break;
  }
  return { from, to, bucket: input.bucket ?? bucket };
}

function bucketKey(d: Date, bucket: "hour" | "day" | "week"): string {
  const x = new Date(d);
  if (bucket === "hour") {
    x.setMinutes(0, 0, 0);
    return x.toISOString();
  }
  if (bucket === "day") {
    x.setUTCHours(0, 0, 0, 0);
    return x.toISOString().slice(0, 10);
  }
  // week: monday
  x.setUTCHours(0, 0, 0, 0);
  const day = x.getUTCDay();
  const diff = (day + 6) % 7;
  x.setUTCDate(x.getUTCDate() - diff);
  return x.toISOString().slice(0, 10);
}

export const getRevenueAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Input) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { from, to, bucket } = resolveWindow(data);

    // Pricing — derive a price-per-coin map from credit_settings packages
    const { data: settings } = await supabaseAdmin.from("credit_settings").select("packages").eq("id", 1).single();
    const packages: { credits: number; price_pence: number }[] = (settings?.packages ?? []) as any;
    const priceMap = new Map<number, number>();
    let avgPence = 100;
    if (packages.length) {
      packages.forEach((p) => priceMap.set(p.credits, p.price_pence));
      avgPence = packages.reduce((s, p) => s + p.price_pence / p.credits, 0) / packages.length;
    }
    const coinsToPence = (coins: number) => priceMap.get(coins) ?? Math.round(coins * avgPence);

    // Transactions in window
    let txQ = supabaseAdmin
      .from("credit_transactions")
      .select("id, professional_id, amount, transaction_type, description, created_at")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false });
    if (scope.kind === "one") txQ = txQ.eq("country", scope.country);
    const { data: tx, error: txErr } = await txQ;
    if (txErr) throw new Error(txErr.message);
    const rows = tx ?? [];

    // Series
    const seriesMap = new Map<string, { revenuePence: number; purchases: number; coins: number }>();
    // Pre-seed buckets
    const stepMs = bucket === "hour" ? 3600_000 : bucket === "day" ? 86400_000 : 7 * 86400_000;
    for (let t = from.getTime(); t <= to.getTime(); t += stepMs) {
      seriesMap.set(bucketKey(new Date(t), bucket), { revenuePence: 0, purchases: 0, coins: 0 });
    }

    let totalPurchases = 0;
    let totalCoinsPurchased = 0;
    let totalRevenuePence = 0;
    let adminAdded = 0;
    let adminRemoved = 0;
    let refunds = 0;
    let spent = 0;

    const spenderMap = new Map<string, { coins: number; transactions: number; lastAt: string }>();

    for (const r of rows) {
      const amt = r.amount ?? 0;
      if (r.transaction_type === "credit_purchase" && amt > 0) {
        const pence = coinsToPence(amt);
        totalPurchases += 1;
        totalCoinsPurchased += amt;
        totalRevenuePence += pence;
        const k = bucketKey(new Date(r.created_at), bucket);
        const cur = seriesMap.get(k) ?? { revenuePence: 0, purchases: 0, coins: 0 };
        cur.revenuePence += pence;
        cur.purchases += 1;
        cur.coins += amt;
        seriesMap.set(k, cur);
        if (r.professional_id) {
          const s = spenderMap.get(r.professional_id) ?? { coins: 0, transactions: 0, lastAt: r.created_at };
          s.coins += amt;
          s.transactions += 1;
          if (new Date(r.created_at) > new Date(s.lastAt)) s.lastAt = r.created_at;
          spenderMap.set(r.professional_id, s);
        }
      } else if (r.transaction_type === "admin_adjustment") {
        if (amt >= 0) adminAdded += amt;
        else adminRemoved += Math.abs(amt);
      } else if (r.transaction_type === "refund") {
        refunds += Math.abs(amt);
      } else if (r.transaction_type === "lead_unlock") {
        spent += Math.abs(amt);
      }
    }

    const series = Array.from(seriesMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => ({ bucket: k, revenuePence: v.revenuePence, revenue: v.revenuePence / 100, purchases: v.purchases, coins: v.coins }));

    // Top spenders enrichment
    const topProIds = Array.from(spenderMap.entries())
      .sort((a, b) => b[1].coins - a[1].coins)
      .slice(0, 10)
      .map(([id]) => id);

    let topSpenders: any[] = [];
    if (topProIds.length) {
      const { data: pros } = await supabaseAdmin
        .from("professionals")
        .select("id, user_id, business_name")
        .in("id", topProIds);
      const proMap = new Map((pros ?? []).map((p: any) => [p.id, p]));
      const userIds = (pros ?? []).map((p: any) => p.user_id).filter(Boolean);
      const profMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds);
        for (const p of profs ?? []) profMap.set(p.id, p.full_name ?? "");
      }
      topSpenders = topProIds.map((id) => {
        const s = spenderMap.get(id)!;
        const pro = proMap.get(id) as any;
        return {
          professional_id: id,
          user_id: pro?.user_id ?? null,
          name: pro?.business_name || (pro?.user_id ? profMap.get(pro.user_id) : null) || "Unknown",
          coinsPurchased: s.coins,
          transactions: s.transactions,
          lastPurchase: s.lastAt,
          revenuePence: coinsToPence(s.coins),
        };
      });
    }

    // Revenue by user type — pros vs admin-credited (clients don't purchase coins on this platform)
    const breakdown = [
      { type: "Pros (purchased)", coins: totalCoinsPurchased, revenuePence: totalRevenuePence },
      { type: "Admin credited", coins: adminAdded, revenuePence: 0 },
      { type: "Admin removed", coins: -adminRemoved, revenuePence: 0 },
      { type: "Refunds", coins: -refunds, revenuePence: 0 },
    ];

    // KPI: counts
    const { count: totalUsers } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    const activeSince = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { count: activeUsers } = await supabaseAdmin
      .from("user_activity_log")
      .select("user_id", { count: "exact", head: true })
      .gte("created_at", activeSince);

    const uniquePayers = spenderMap.size;
    const avgSpendPerPayer = uniquePayers > 0 ? totalRevenuePence / uniquePayers : 0;

    return {
      window: { from: from.toISOString(), to: to.toISOString(), bucket },
      kpi: {
        totalRevenuePence,
        totalCoinsPurchased,
        totalPurchases,
        totalUsers: totalUsers ?? 0,
        activeUsers: activeUsers ?? 0,
        uniquePayers,
        avgSpendPerPayerPence: Math.round(avgSpendPerPayer),
        adminAdded,
        adminRemoved,
        refunds,
        spent,
      },
      series,
      topSpenders,
      breakdown,
      pricing: { avgPencePerCoin: Math.round(avgPence) },
    };
  });
