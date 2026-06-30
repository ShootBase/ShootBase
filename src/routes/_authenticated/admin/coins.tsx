import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Coins, TrendingDown, TrendingUp, Wallet, Search, ChevronLeft, ChevronRight, Gift, Settings2, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPage } from "@/components/admin/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCoinsOverview, listCoinTransactions } from "@/lib/admin/coins.functions";

export const Route = createFileRoute("/_authenticated/admin/coins")({
  component: CoinsPage,
});

const TYPE_LABEL: Record<string, string> = {
  credit_purchase: "Purchase",
  admin_adjustment: "Admin adjustment",
  lead_unlock: "Project unlock",
  welcome_bonus: "Welcome bonus",
  refund: "Refund",
  subscription_grant: "Subscription grant",
  auto_topup: "Auto top-up",
};

const TYPE_TONE: Record<string, string> = {
  credit_purchase: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  admin_adjustment: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  lead_unlock: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  welcome_bonus: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  refund: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

function Stat({ label, value, icon: Icon, hint }: { label: string; value: number | string; icon: any; hint?: string }) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
            {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CoinsPage() {
  const overviewFn = useServerFn(getCoinsOverview);
  const listFn = useServerFn(listCoinTransactions);
  const queryClient = useQueryClient();
  const [range, setRange] = useState<"last24h" | "last7d" | "last30d" | "lifetime">("last30d");
  const [type, setType] = useState<"all" | "credit_purchase" | "admin_adjustment" | "lead_unlock" | "welcome_bonus" | "refund">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [live, setLive] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  const { data: overview, isLoading: oLoading } = useQuery({
    queryKey: ["admin-coins-overview"],
    queryFn: () => overviewFn(),
  });
  const { data: txData, isLoading: tLoading } = useQuery({
    queryKey: ["admin-coins-tx", type, q, page],
    queryFn: () => listFn({ data: { type, q: q || undefined, page } }),
  });

  // Live updates: subscribe to credit_transactions and profile changes so the
  // coin overview + transaction feed reflect activity in real time.
  useEffect(() => {
    const channel = supabase
      .channel("admin-coins-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_transactions" },
        () => {
          setLastEventAt(new Date());
          queryClient.invalidateQueries({ queryKey: ["admin-coins-overview"] });
          queryClient.invalidateQueries({ queryKey: ["admin-coins-tx"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-coins-overview"] });
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const bucket = overview?.[range];
  const totalPages = txData ? Math.max(1, Math.ceil(txData.total / txData.pageSize)) : 1;

  return (
    <AdminPage title="Coins" description="Coin economy across the platform — purchases, adjustments and spend.">
      <Card className="p-3 border-border/60 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={range} onValueChange={(v) => setRange(v as any)}>
            <TabsList>
              <TabsTrigger value="last24h">Last 24h</TabsTrigger>
              <TabsTrigger value="last7d">Last 7 days</TabsTrigger>
              <TabsTrigger value="last30d">Last 30 days</TabsTrigger>
              <TabsTrigger value="lifetime">Lifetime</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${live ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border bg-muted text-muted-foreground"}`}>
            <span className="relative inline-flex h-2 w-2">
              {live && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
            </span>
            <Radio className="h-3 w-3" />
            <span>{live ? "Live" : "Connecting…"}</span>
            {lastEventAt && <span className="text-muted-foreground/80">· updated {lastEventAt.toLocaleTimeString()}</span>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {oLoading || !overview || !bucket ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/60"><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Stat label="In circulation" value={overview.inCirculation.toLocaleString()} icon={Wallet} hint="Sum of all pro balances" />
            <Stat label="Purchased" value={bucket.purchased.toLocaleString()} icon={Coins} hint="Coins bought by pros" />
            <Stat label="Spent on projects" value={bucket.spent.toLocaleString()} icon={TrendingDown} hint="Project unlocks" />
            <Stat label="Admin added / removed" value={`+${bucket.adminAdded} / -${bucket.adminRemoved}`} icon={Settings2} hint="Manual adjustments" />
          </>
        )}
      </div>

      {bucket && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Welcome bonuses" value={bucket.welcome.toLocaleString()} icon={Gift} />
          <Stat label="Net change" value={(bucket.net >= 0 ? "+" : "") + bucket.net.toLocaleString()} icon={TrendingUp} />
        </div>
      )}

      <Card className="p-3 border-border/60 shadow-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search pro / user / description…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9 h-9" />
          </div>
          <Select value={type} onValueChange={(v) => { setType(v as any); setPage(1); }}>
            <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="credit_purchase">Purchase</SelectItem>
              <SelectItem value="admin_adjustment">Admin adjustment</SelectItem>
              <SelectItem value="lead_unlock">Project unlock</SelectItem>
              <SelectItem value="welcome_bonus">Welcome bonus</SelectItem>
              <SelectItem value="refund">Refund</SelectItem>
            </SelectContent>
          </Select>
          <div className="sm:ml-auto text-xs text-muted-foreground self-center">
            {txData?.total ?? 0} transactions
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tLoading && Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}</TableRow>
              ))}
              {!tLoading && (txData?.rows ?? []).map((r: any) => (
                <TableRow key={r.id} className="hover:bg-muted/40">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
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
                    <Badge className={`capitalize ${TYPE_TONE[r.transaction_type] ?? "bg-muted text-foreground"}`}>
                      {TYPE_LABEL[r.transaction_type] ?? r.transaction_type}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${r.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {r.amount >= 0 ? "+" : ""}{r.amount}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-md truncate">{r.description ?? "—"}</TableCell>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">{r.id ? String(r.id).slice(0, 8) : "—"}</TableCell>
                </TableRow>
              ))}
              {!tLoading && (txData?.rows ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">No transactions match.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground">Page {page} of {totalPages}</div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /> Prev</Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </AdminPage>
  );
}
