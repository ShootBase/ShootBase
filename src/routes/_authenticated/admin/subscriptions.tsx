import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  CreditCard,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  XCircle,
  Sparkles,
  Search,
  ChevronLeft,
  ChevronRight,
  Radio,
  Coins,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPage } from "@/components/admin/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getSubscriptionsOverview,
  listSubscriptions,
} from "@/lib/admin/subscriptions.functions";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  component: SubscriptionsPage,
});

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  trialing: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
  past_due: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  canceled: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
  incomplete: "bg-muted text-muted-foreground border-border",
  paused: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30",
  unpaid: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

function Stat({
  label,
  value,
  icon: Icon,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  icon: any;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
            {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
          </div>
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone ?? "bg-primary/10 text-primary"}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SubscriptionsPage() {
  const overviewFn = useServerFn(getSubscriptionsOverview);
  const listFn = useServerFn(listSubscriptions);
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<
    "all" | "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "paused" | "unpaid"
  >("all");
  const [environment, setEnvironment] = useState<"all" | "sandbox" | "live">("all");
  const [renewingOnly, setRenewingOnly] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [live, setLive] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  const { data: overview, isLoading: oLoading } = useQuery({
    queryKey: ["admin-subs-overview"],
    queryFn: () => overviewFn(),
  });

  const { data: listData, isLoading: lLoading } = useQuery({
    queryKey: ["admin-subs-list", status, environment, renewingOnly, q, page],
    queryFn: () => listFn({ data: { status, environment, renewingOnly, q: q || undefined, page } }),
  });

  // Realtime: subscribe to credit_subscriptions changes for live updates
  useEffect(() => {
    const channel = supabase
      .channel("admin-subs-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_subscriptions" },
        () => {
          setLastEventAt(new Date());
          queryClient.invalidateQueries({ queryKey: ["admin-subs-overview"] });
          queryClient.invalidateQueries({ queryKey: ["admin-subs-list"] });
        },
      )
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const totalPages = listData ? Math.max(1, Math.ceil(listData.total / listData.pageSize)) : 1;

  return (
    <AdminPage
      title="Subscriptions"
      description="Live view of every subscriber across the platform — active, trialing, past-due, renewing, and canceled."
    >
      {/* Live status pill */}
      <Card className="p-3 border-border/60 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {overview ? (
              <>
                <span className="font-medium text-foreground">{overview.total}</span> total subscription
                {overview.total === 1 ? "" : "s"} · <span className="font-medium text-foreground">{overview.active + overview.trialing}</span> live ·{" "}
                <span className="font-medium text-foreground">{overview.renewingSoon}</span> renewing within 7 days
              </>
            ) : (
              <Skeleton className="h-4 w-72" />
            )}
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${
              live
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            <span className="relative inline-flex h-2 w-2">
              {live && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
            </span>
            <Radio className="h-3 w-3" />
            <span>{live ? "Live" : "Connecting…"}</span>
            {lastEventAt && <span className="text-muted-foreground/80">· {lastEventAt.toLocaleTimeString()}</span>}
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {oLoading || !overview ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/60">
              <CardContent className="p-5">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Stat label="Active" value={overview.active.toLocaleString()} icon={CreditCard} hint="Paid and current" tone="bg-emerald-500/10 text-emerald-600" />
            <Stat label="Trialing" value={overview.trialing.toLocaleString()} icon={Sparkles} hint="In free trial" tone="bg-sky-500/10 text-sky-600" />
            <Stat label="Past due" value={overview.pastDue.toLocaleString()} icon={AlertTriangle} hint="Payment failed, retrying" tone="bg-amber-500/10 text-amber-600" />
            <Stat label="Canceled" value={overview.canceled.toLocaleString()} icon={XCircle} hint="No longer billing" tone="bg-rose-500/10 text-rose-600" />
          </>
        )}
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Renewing in 7 days"
            value={overview.renewingSoon.toLocaleString()}
            icon={RefreshCw}
            hint="Auto-renewal upcoming"
            tone="bg-primary/10 text-primary"
          />
          <Stat
            label="Canceling at period end"
            value={overview.cancelingAtPeriodEnd.toLocaleString()}
            icon={XCircle}
            hint="Access until period end"
            tone="bg-amber-500/10 text-amber-600"
          />
          <Stat
            label="New in last 24h"
            value={overview.newLast24h.toLocaleString()}
            icon={TrendingUp}
            hint="Fresh subscribers"
            tone="bg-emerald-500/10 text-emerald-600"
          />
          <Stat
            label="Coins / period"
            value={overview.totalCoinsPerPeriod.toLocaleString()}
            icon={Coins}
            hint="Granted by active subs"
          />
        </div>
      )}

      {/* Filters */}
      <Card className="p-3 border-border/60 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search user, email, plan, customer id…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-9"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as any);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="trialing">Trialing</SelectItem>
              <SelectItem value="past_due">Past due</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
              <SelectItem value="incomplete">Incomplete</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={environment}
            onValueChange={(v) => {
              setEnvironment(v as any);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All envs</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="sandbox">Test</SelectItem>
            </SelectContent>
          </Select>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground rounded-md border border-border/60 px-3 h-9">
            <Switch
              checked={renewingOnly}
              onCheckedChange={(v) => {
                setRenewingOnly(!!v);
                setPage(1);
              }}
            />
            Renewing only
          </label>
          <div className="sm:ml-auto text-xs text-muted-foreground self-center">
            {listData?.total ?? 0} subscribers
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Subscriber</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Coins / period</TableHead>
                <TableHead>Renewal</TableHead>
                <TableHead>Env</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!lLoading &&
                (listData?.rows ?? []).map((r: any) => {
                  const renewing = !r.cancel_at_period_end && (r.status === "active" || r.status === "trialing");
                  return (
                    <TableRow key={r.id} className="hover:bg-muted/40">
                      <TableCell>
                        {r.user_id ? (
                          <Link to="/admin/users/$id" params={{ id: r.user_id }} className="hover:underline">
                            <div className="font-medium">{r.business_name ?? r.user_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.user_email ?? "—"}</div>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize border ${STATUS_TONE[r.status] ?? "bg-muted text-foreground"}`}>
                          {String(r.status).replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{r.price_id}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{String(r.stripe_subscription_id).slice(0, 18)}…</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{r.credits_per_period}</TableCell>
                      <TableCell>
                        {r.current_period_end ? (
                          <div className="space-y-0.5">
                            <div className="text-xs">{new Date(r.current_period_end).toLocaleDateString()}</div>
                            <Badge
                              variant="outline"
                              className={
                                renewing
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                              }
                            >
                              {renewing ? "Auto-renew" : "Ends"}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={r.environment === "live" ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground"}>
                          {r.environment === "live" ? "Live" : "Test"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.updated_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              {!lLoading && (listData?.rows ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                    No subscriptions match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </AdminPage>
  );
}
