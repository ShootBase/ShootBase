import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyCountryFilter, resolveAdminCountry } from "@/lib/admin/country.server";

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isStaff } = await supabase.rpc("is_staff", { _uid: userId });
    if (!isStaff) throw new Error("Forbidden");

    const scope = await resolveAdminCountry(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const dayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const weekIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const profiles = () => applyCountryFilter(supabase.from("profiles").select("*", { count: "exact", head: true }), scope);
    const supportQ = () => applyCountryFilter(supabase.from("support_requests").select("*", { count: "exact", head: true }), scope);
    const jobsQ = () => applyCountryFilter(supabase.from("jobs").select("*", { count: "exact", head: true }), scope);

    // Build a country-scoped credit transactions query (since 24h)
    let coinTxQ = supabaseAdmin
      .from("credit_transactions")
      .select("amount, transaction_type, country")
      .gte("created_at", dayIso)
      .limit(5000);
    if (scope.kind === "one") coinTxQ = coinTxQ.eq("country", scope.country);

    // Coin circulation: filter professional_credits by country
    let coinBalancesQ = supabaseAdmin.from("professional_credits").select("credit_balance, country");
    if (scope.kind === "one") coinBalancesQ = coinBalancesQ.eq("country", scope.country);

    // Active users (last 7d): filter user_activity_log by country
    let activeQ = supabaseAdmin
      .from("user_activity_log")
      .select("user_id, country")
      .gte("created_at", weekIso)
      .limit(10000);
    if (scope.kind === "one") activeQ = activeQ.eq("country", scope.country);

    // Recent admin activity (audit log) — scope by country, but include
    // global (NULL country) actions when viewing "all".
    let auditQ = supabase
      .from("admin_audit_logs")
      .select("id, action, entity_type, entity_id, actor_user_id, created_at, metadata, country")
      .order("created_at", { ascending: false })
      .limit(20);
    if (scope.kind === "one") auditQ = auditQ.eq("country", scope.country);

    const [
      usersTotal,
      customers,
      professionals,
      newToday,
      newWeek,
      newMonth,
      ticketsOpen,
      ticketsTotal,
      leadsOpen,
      leadsClosed,
      coinTxToday,
      coinBalances,
      activeUsersResp,
      recentActivity,
    ] = await Promise.all([
      profiles(),
      profiles().eq("account_type", "customer"),
      applyCountryFilter(supabase.from("professionals").select("*", { count: "exact", head: true }), scope).eq("status", "active"),
      profiles().gte("created_at", dayIso),
      profiles().gte("created_at", weekIso),
      profiles().gte("created_at", monthIso),
      supportQ().eq("status", "open"),
      supportQ(),
      jobsQ().eq("status", "open"),
      jobsQ().eq("status", "closed"),
      coinTxQ,
      coinBalancesQ,
      activeQ,
      auditQ,
    ]);

    const purchasesToday = (coinTxToday.data ?? [])
      .filter((r: any) => r.transaction_type === "credit_purchase")
      .reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
    const spendingToday = (coinTxToday.data ?? [])
      .filter((r: any) => r.transaction_type === "lead_unlock")
      .reduce((s: number, r: any) => s + Math.abs(r.amount ?? 0), 0);
    const refundsToday = (coinTxToday.data ?? [])
      .filter((r: any) => r.transaction_type === "refund" || r.transaction_type === "credit_refund")
      .reduce((s: number, r: any) => s + Math.abs(r.amount ?? 0), 0);
    const coinsInCirculation = (coinBalances.data ?? []).reduce(
      (s: number, r: any) => s + (r.credit_balance ?? 0),
      0,
    );
    const activeUsers7d = new Set(((activeUsersResp.data as any[]) ?? []).map((r) => r.user_id)).size;

    return {
      users: usersTotal.count ?? 0,
      customers: customers.count ?? 0,
      professionals: professionals.count ?? 0,
      newUsersToday: newToday.count ?? 0,
      newUsersWeek: newWeek.count ?? 0,
      newUsersMonth: newMonth.count ?? 0,
      activeUsers7d,
      ticketsOpen: ticketsOpen.count ?? 0,
      ticketsTotal: ticketsTotal.count ?? 0,
      leadsOpen: leadsOpen.count ?? 0,
      leadsClosed: leadsClosed.count ?? 0,
      coinPurchasesToday: purchasesToday,
      coinSpendingToday: spendingToday,
      coinRefundsToday: refundsToday,
      coinsInCirculation,
      recentActivity: recentActivity.data ?? [],
      country: scope.country,
    };
  });
