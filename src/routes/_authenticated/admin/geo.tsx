import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useState } from "react";
import { Globe2, Users, MapPin, UserCheck, Sparkles } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { AdminPage, useStaff } from "@/components/admin/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getGeoAnalytics } from "@/lib/admin/geo.functions";

const GeoMap = lazy(() => import("@/components/admin/GeoMap"));

export const Route = createFileRoute("/_authenticated/admin/geo")({
  component: GeoPage,
  errorComponent: ({ error, reset }) => (
    <AdminPage title="Geo Analytics" description="Where your users come from.">
      <Card className="border-border/60">
        <CardContent className="p-10 text-center space-y-3">
          <div className="text-sm font-medium">Geo analytics couldn't load.</div>
          <div className="text-xs text-muted-foreground break-words">{error?.message ?? "Unknown error"}</div>
          <button onClick={() => reset()} className="text-xs underline text-primary">Try again</button>
        </CardContent>
      </Card>
    </AdminPage>
  ),
});

const COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

function formatGBP(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format((pence ?? 0) / 100);
}

function Kpi({ label, value, sub, icon: Icon }: any) {
  return (
    <Card className="border-border/60 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
      <CardContent className="p-5">
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
      </CardContent>
    </Card>
  );
}

function GeoPage() {
  const staff = useStaff();
  const fn = useServerFn(getGeoAnalytics);
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");

  const enabled = staff?.role === "super_admin" || staff?.role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["admin-geo", range],
    queryFn: () => fn({ data: { range } }),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (!staff) {
    return <AdminPage title="Geo Analytics" description=""><Skeleton className="h-40" /></AdminPage>;
  }
  if (!enabled) {
    return (
      <AdminPage title="Geo Analytics" description="Restricted area.">
        <Card className="border-border/60">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Only administrators can view geo analytics.
          </CardContent>
        </Card>
      </AdminPage>
    );
  }

  const kpi = data?.kpi;

  return (
    <AdminPage title="Geo Analytics" description="Where your users, activity and revenue come from across the world.">
      <Card className="p-3 border-border/60 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={range} onValueChange={(v) => setRange(v as any)}>
            <TabsList>
              <TabsTrigger value="7d">Last 7 days</TabsTrigger>
              <TabsTrigger value="30d">Last 30 days</TabsTrigger>
              <TabsTrigger value="90d">Last 90 days</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="ml-auto text-xs text-muted-foreground flex items-center gap-3">
            <Link to="/admin/revenue" className="hover:text-foreground transition-colors">Revenue analytics</Link>
            <span className="opacity-30">·</span>
            <Link to="/admin/activity" className="hover:text-foreground transition-colors">Activity</Link>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading || !kpi ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/60"><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Kpi label="Total users" value={kpi.totalUsers.toLocaleString()} sub="With known location" icon={Users} />
            <Kpi label="Active users" value={kpi.activeUsers.toLocaleString()} sub={`In last ${range}`} icon={UserCheck} />
            <Kpi label="Countries" value={kpi.totalCountries.toLocaleString()} sub="Represented" icon={Globe2} />
            <Kpi label="Cities" value={kpi.totalCities.toLocaleString()} sub="Unique locations" icon={MapPin} />
          </>
        )}
      </div>

      {data?.insights && data.insights.length > 0 && (
        <Card className="border-border/60 shadow-sm bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Smart insights</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="grid sm:grid-cols-2 gap-2 text-sm">
              {data.insights.map((s, i) => (
                <li key={i} className="rounded-lg border border-border/50 bg-card/60 px-3 py-2">{s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">User & activity map</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[420px] w-full">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (data?.mapPoints?.length ?? 0) === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">No geolocated users yet.</div>
            ) : (
              <Suspense fallback={<Skeleton className="h-full w-full" />}>
                <GeoMap points={data!.mapPoints} />
              </Suspense>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Regional signups over time</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.trends ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(data?.regions ?? []).map((r, i) => (
                  <Line key={r} type="monotone" dataKey={r} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Top countries</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Country</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Coins purchased</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))}
              {!isLoading && (data?.countries ?? []).map((c) => (
                <TableRow key={c.country} className="hover:bg-muted/40">
                  <TableCell className="font-medium">{c.country}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.users.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.activeUsers.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.coinsPurchased.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatGBP(c.revenuePence)}</TableCell>
                </TableRow>
              ))}
              {!isLoading && (data?.countries ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-12 text-sm text-muted-foreground">No location data yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Top cities</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>City</TableHead>
                <TableHead>Country</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))}
              {!isLoading && (data?.cities ?? []).map((c, i) => (
                <TableRow key={`${c.country}-${c.city}-${i}`} className="hover:bg-muted/40">
                  <TableCell className="font-medium">{c.city || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.country}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.users.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.activeUsers.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatGBP(c.revenuePence)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminPage>
  );
}
