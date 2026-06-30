import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Coins, Users, UserCheck, Receipt, TrendingUp, PoundSterling, Wallet,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from "recharts";
import { AdminPage } from "@/components/admin/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getRevenueAnalytics } from "@/lib/admin/revenue.functions";
import { useStaff } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/_authenticated/admin/revenue")({
  component: RevenuePage,
});

type Range = "24h" | "7d" | "30d" | "custom";

const COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"];

function formatGBP(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format((pence ?? 0) / 100);
}

function Kpi({ label, value, sub, icon: Icon, onClick, active }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left transition-all rounded-xl border bg-card p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 ${active ? "border-primary ring-2 ring-primary/20" : "border-border/60"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </button>
  );
}

function RevenuePage() {
  const staff = useStaff();
  const fn = useServerFn(getRevenueAnalytics);
  const [range, setRange] = useState<Range>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const enabled = staff?.role === "super_admin";

  const { data, isLoading } = useQuery({
    queryKey: ["admin-revenue", range, from, to],
    queryFn: () => fn({ data: { range, from: from || undefined, to: to || undefined } }),
    enabled,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const breakdownData = useMemo(
    () => (data?.breakdown ?? []).filter((b) => b.coins !== 0).map((b) => ({ name: b.type, value: Math.abs(b.coins) })),
    [data],
  );

  if (!staff) {
    return <AdminPage title="Revenue Analytics" description=""><Skeleton className="h-40" /></AdminPage>;
  }
  if (!enabled) {
    return (
      <AdminPage title="Revenue Analytics" description="Restricted area.">
        <Card className="border-border/60">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Only super administrators can view revenue analytics.
          </CardContent>
        </Card>
      </AdminPage>
    );
  }

  const kpi = data?.kpi;

  return (
    <AdminPage title="Revenue Analytics" description="Real-time revenue, coin sales and spending across the platform.">
      <Card className="p-3 border-border/60 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList>
              <TabsTrigger value="24h">Last 24h</TabsTrigger>
              <TabsTrigger value="7d">Last 7 days</TabsTrigger>
              <TabsTrigger value="30d">Last 30 days</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
          </Tabs>
          {range === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
            </div>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live • auto-refresh
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {isLoading || !kpi ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border-border/60"><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Kpi label="Total Revenue" value={formatGBP(kpi.totalRevenuePence)} sub={`${kpi.totalCoinsPurchased.toLocaleString()} coins`} icon={PoundSterling} />
            <Kpi label="Transactions" value={kpi.totalPurchases.toLocaleString()} sub={`${kpi.uniquePayers} unique buyers`} icon={Receipt} />
            <Kpi label="Avg Spend / Buyer" value={formatGBP(kpi.avgSpendPerPayerPence)} sub="In selected window" icon={TrendingUp} />
            <Kpi label="Active Users" value={kpi.activeUsers.toLocaleString()} sub="Last 30 days" icon={UserCheck} onClick={() => undefined} />
            <Kpi label="Total Users" value={kpi.totalUsers.toLocaleString()} sub="All-time" icon={Users} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2 border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Revenue over time</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.series ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(5, 16)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                  <Tooltip
                    formatter={(v: any, name: any) => name === "revenue" ? [`£${Number(v).toFixed(2)}`, "Revenue"] : [v, name]}
                    labelFormatter={(l) => String(l)}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} fill="url(#rev)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Coin movement breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? <Skeleton className="h-full w-full" /> : breakdownData.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">No activity in range</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={breakdownData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                    {breakdownData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString()} coins`, ""]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Coin purchases per bucket</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.series ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(5, 16)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="purchases" name="Transactions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="coins" name="Coins sold" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Top spenders</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link to="/admin/coins">View all transactions</Link></Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>User</TableHead>
                <TableHead className="text-right">Coins purchased</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead>Last purchase</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))}
              {!isLoading && (data?.topSpenders ?? []).map((s: any) => (
                <TableRow key={s.professional_id} className="hover:bg-muted/40">
                  <TableCell>
                    {s.user_id ? (
                      <Link to="/admin/users/$id" params={{ id: s.user_id }} className="font-medium hover:underline">{s.name}</Link>
                    ) : <span className="font-medium">{s.name}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.coinsPurchased.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatGBP(s.revenuePence)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.transactions}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(s.lastPurchase).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {!isLoading && (data?.topSpenders ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-12 text-sm text-muted-foreground">No purchases in this window.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {kpi && (kpi.adminAdded || kpi.adminRemoved || kpi.refunds) ? (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Adjustments & refunds</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <Kpi label="Admin added" value={kpi.adminAdded.toLocaleString()} sub="Coins granted manually" icon={Wallet} />
            <Kpi label="Admin removed" value={kpi.adminRemoved.toLocaleString()} sub="Coins clawed back" icon={Wallet} />
            <Kpi label="Refunds" value={kpi.refunds.toLocaleString()} sub="Coin refunds issued" icon={Coins} />
          </CardContent>
        </Card>
      ) : null}
    </AdminPage>
  );
}
