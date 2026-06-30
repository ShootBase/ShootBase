import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./_guard";
import { resolveAdminCountry } from "./country.server";




type Range = "7d" | "30d" | "90d";
type Input = { range?: Range };

const REGION_FOR_COUNTRY: Record<string, string> = {
  "United Kingdom": "Europe",
  "Ireland": "Europe",
  "France": "Europe",
  "Germany": "Europe",
  "Spain": "Europe",
  "Italy": "Europe",
  "Netherlands": "Europe",
  "United States": "North America",
  "Canada": "North America",
  "Australia": "Oceania",
  "New Zealand": "Oceania",
};

function regionOf(country?: string | null) {
  if (!country) return "Unknown";
  return REGION_FOR_COUNTRY[country] ?? "Other";
}

function dayKey(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

export const getGeoAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Input) => d)
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "analytics.view");
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const range: Range = data.range ?? "30d";
    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
    const since = new Date(Date.now() - days * 86400_000);
    const sinceIso = since.toISOString();

    // Pricing
    const { data: settings } = await supabaseAdmin.from("credit_settings").select("packages").eq("id", 1).single();
    const pkgs: { credits: number; price_pence: number }[] = (settings?.packages ?? []) as any;
    const priceMap = new Map<number, number>();
    let avgPence = 100;
    if (pkgs.length) {
      pkgs.forEach((p) => priceMap.set(p.credits, p.price_pence));
      avgPence = pkgs.reduce((s, p) => s + p.price_pence / p.credits, 0) / pkgs.length;
    }
    const coinsToPence = (coins: number) => priceMap.get(coins) ?? Math.round(coins * avgPence);

    // All professionals (location source of truth)
    let prosQ = supabaseAdmin
      .from("professionals")
      .select("id, user_id, business_name, city, country, latitude, longitude, created_at");
    if (scope.kind === "one") prosQ = prosQ.eq("country", scope.country);
    const { data: pros } = await prosQ;

    const proById = new Map<string, any>();
    for (const p of pros ?? []) proById.set(p.id, p);

    // Activity in window — recent active users (by their user_id)
    const { data: activity } = await supabaseAdmin
      .from("user_activity_log")
      .select("user_id, created_at")
      .gte("created_at", sinceIso);
    const activeUserIds = new Set<string>();
    for (const a of activity ?? []) if (a.user_id) activeUserIds.add(a.user_id);

    // Purchases in window
    const { data: tx } = await supabaseAdmin
      .from("credit_transactions")
      .select("professional_id, amount, transaction_type, created_at")
      .gte("created_at", sinceIso);
    const purchaseByPro = new Map<string, { coins: number; pence: number; transactions: number }>();
    for (const r of tx ?? []) {
      if (r.transaction_type !== "credit_purchase" || (r.amount ?? 0) <= 0 || !r.professional_id) continue;
      const cur = purchaseByPro.get(r.professional_id) ?? { coins: 0, pence: 0, transactions: 0 };
      cur.coins += r.amount;
      cur.pence += coinsToPence(r.amount);
      cur.transactions += 1;
      purchaseByPro.set(r.professional_id, cur);
    }

    // Aggregate by country + city
    type Agg = {
      country: string;
      city: string;
      latitude: number | null;
      longitude: number | null;
      users: number;
      activeUsers: number;
      coinsPurchased: number;
      revenuePence: number;
      transactions: number;
    };
    const cityMap = new Map<string, Agg>();
    const countryMap = new Map<string, Omit<Agg, "city" | "latitude" | "longitude">>();

    for (const p of pros ?? []) {
      const country = (p.country ?? "Unknown").trim() || "Unknown";
      const city = (p.city ?? "").trim() || "Unknown";
      const cityKey = `${country}::${city}`;
      const purch = p.id ? purchaseByPro.get(p.id) : undefined;
      const isActive = p.user_id && activeUserIds.has(p.user_id);

      const cur = cityMap.get(cityKey) ?? {
        country,
        city,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        users: 0,
        activeUsers: 0,
        coinsPurchased: 0,
        revenuePence: 0,
        transactions: 0,
      };
      cur.users += 1;
      if (isActive) cur.activeUsers += 1;
      cur.coinsPurchased += purch?.coins ?? 0;
      cur.revenuePence += purch?.pence ?? 0;
      cur.transactions += purch?.transactions ?? 0;
      // Prefer first non-null coordinates
      if (cur.latitude == null && p.latitude != null) cur.latitude = p.latitude;
      if (cur.longitude == null && p.longitude != null) cur.longitude = p.longitude;
      cityMap.set(cityKey, cur);

      const cc = countryMap.get(country) ?? { country, users: 0, activeUsers: 0, coinsPurchased: 0, revenuePence: 0, transactions: 0 };
      cc.users += 1;
      if (isActive) cc.activeUsers += 1;
      cc.coinsPurchased += purch?.coins ?? 0;
      cc.revenuePence += purch?.pence ?? 0;
      cc.transactions += purch?.transactions ?? 0;
      countryMap.set(country, cc);
    }

    const cities = Array.from(cityMap.values()).sort((a, b) => b.users - a.users);
    const countries = Array.from(countryMap.values()).sort((a, b) => b.users - a.users).slice(0, 20);

    // Region signup trends — signups by region over time
    const trendMap = new Map<string, Map<string, number>>(); // day -> region -> count
    const allRegions = new Set<string>();
    for (const p of pros ?? []) {
      if (!p.created_at) continue;
      const created = new Date(p.created_at);
      if (created < since) continue;
      const k = dayKey(created);
      const r = regionOf(p.country);
      allRegions.add(r);
      const row = trendMap.get(k) ?? new Map<string, number>();
      row.set(r, (row.get(r) ?? 0) + 1);
      trendMap.set(k, row);
    }
    // Pre-seed every day
    for (let t = since.getTime(); t <= Date.now(); t += 86400_000) {
      const k = dayKey(new Date(t));
      if (!trendMap.has(k)) trendMap.set(k, new Map());
    }
    const regionList = Array.from(allRegions);
    const trends = Array.from(trendMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, row]) => {
        const obj: Record<string, any> = { day };
        for (const r of regionList) obj[r] = row.get(r) ?? 0;
        return obj;
      });

    // Insights
    const insights: string[] = [];
    const topCountry = countries[0];
    if (topCountry) {
      const totalUsers = countries.reduce((s, c) => s + c.users, 0) || 1;
      const pct = Math.round((topCountry.users / totalUsers) * 100);
      insights.push(`Most users come from ${topCountry.country} (${pct}% of all users).`);
    }
    if (cities[0]) {
      insights.push(`Top city: ${cities[0].city || "Unknown"} with ${cities[0].users} pro${cities[0].users === 1 ? "" : "s"}.`);
    }
    const revLeader = [...countries].sort((a, b) => b.revenuePence - a.revenuePence)[0];
    if (revLeader && revLeader.revenuePence > 0) {
      insights.push(`Highest-spending region: ${revLeader.country} (£${(revLeader.revenuePence / 100).toFixed(0)} in last ${days} days).`);
    }
    const lastWeekStart = new Date(Date.now() - 7 * 86400_000);
    const prevWeekStart = new Date(Date.now() - 14 * 86400_000);
    const recentByRegion = new Map<string, number>();
    const prevByRegion = new Map<string, number>();
    for (const p of pros ?? []) {
      if (!p.created_at) continue;
      const c = new Date(p.created_at);
      const r = regionOf(p.country);
      if (c >= lastWeekStart) recentByRegion.set(r, (recentByRegion.get(r) ?? 0) + 1);
      else if (c >= prevWeekStart) prevByRegion.set(r, (prevByRegion.get(r) ?? 0) + 1);
    }
    let bestGrowth: { region: string; pct: number } | null = null;
    for (const [r, cur] of recentByRegion) {
      const prev = prevByRegion.get(r) ?? 0;
      const growth = prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
      if (cur > 0 && (!bestGrowth || growth > bestGrowth.pct)) bestGrowth = { region: r, pct: growth };
    }
    if (bestGrowth) insights.push(`Fastest-growing region: ${bestGrowth.region} (${bestGrowth.pct >= 0 ? "+" : ""}${bestGrowth.pct}% week-over-week).`);

    return {
      range,
      window: { from: sinceIso, to: new Date().toISOString() },
      kpi: {
        totalUsers: (pros ?? []).length,
        totalCountries: countryMap.size,
        totalCities: cityMap.size,
        activeUsers: Array.from(cityMap.values()).reduce((s, c) => s + c.activeUsers, 0),
      },
      countries,
      cities: cities.slice(0, 50),
      mapPoints: cities
        .filter((c) => c.latitude != null && c.longitude != null)
        .map((c) => ({
          lat: c.latitude!,
          lng: c.longitude!,
          city: c.city,
          country: c.country,
          users: c.users,
          activeUsers: c.activeUsers,
          revenuePence: c.revenuePence,
        })),
      regions: regionList,
      trends,
      insights,
    };
  });
