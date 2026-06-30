import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users,
  UserCheck,
  Camera,
  UserPlus,
  LifeBuoy,
  Inbox,
  CheckCircle2,
  Coins,
  TrendingDown,
  Database,
} from "lucide-react";
import { AdminPage } from "@/components/admin/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOverview } from "@/lib/admin/dashboard.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

type StatTone = "default" | "primary" | "success" | "warning";
const TONE: Record<StatTone, string> = {
  default: "bg-muted text-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

function Stat({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
  to,
  search,
}: {
  label: string;
  value: number | string;
  icon: any;
  tone?: StatTone;
  hint?: string;
  to?: string;
  search?: Record<string, any>;
}) {
  const card = (
    <Card className="group relative h-full overflow-hidden border-border/60 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 cursor-pointer focus-within:ring-2 focus-within:ring-primary/40">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
              {value}
            </div>
            {hint && (
              <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
            )}
          </div>
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONE[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (!to) {
    return (
      <div className="opacity-90" aria-label={label}>
        {card}
      </div>
    );
  }
  return (
    <Link
      to={to as any}
      search={search as any}
      className="block focus:outline-none"
      aria-label={`Open ${label}`}
    >
      {card}
    </Link>
  );
}

function StatSkeleton() {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

function AdminDashboard() {
  const fn = useServerFn(getAdminOverview);
  const { data, isLoading } = useQuery({ queryKey: ["admin-overview"], queryFn: () => fn() });

  return (
    <AdminPage title="Dashboard" description="Platform overview — click any tile to drill in.">
      <Section title="People">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {isLoading || !data ? (
            <>
              <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
            </>
          ) : (
            <>
              <Stat
                label="Total users"
                value={data.users}
                icon={Users}
                tone="primary"
                to="/admin/users"
                search={{ type: "all", status: "all" }}
              />
              <Stat
                label="Customers"
                value={data.customers}
                icon={UserCheck}
                to="/admin/users"
                search={{ type: "customer", status: "all" }}
              />
              <Stat
                label="Active pros"
                value={data.professionals}
                icon={Camera}
                tone="success"
                to="/admin/users"
                search={{ type: "professional", status: "active" }}
              />
              <Stat
                label="New today"
                value={data.newUsersToday}
                icon={UserPlus}
                tone="primary"
                to="/admin/activity"
              />
            </>
          )}
        </div>
      </Section>

      <Section title="Support & projects">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {isLoading || !data ? (
            <>
              <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
            </>
          ) : (
            <>
              <Stat
                label="Open tickets"
                value={data.ticketsOpen}
                icon={LifeBuoy}
                tone="warning"
                to="/admin/tickets"
                search={{ status: "open" }}
              />
              <Stat
                label="All tickets"
                value={data.ticketsTotal}
                icon={Inbox}
                to="/admin/tickets"
                search={{ status: "all" }}
              />
              <Stat
                label="Open projects"
                value={data.leadsOpen}
                icon={Inbox}
                tone="primary"
                to="/admin/lead-notifications"
              />
              <Stat
                label="Closed projects"
                value={data.leadsClosed}
                icon={CheckCircle2}
                tone="success"
                to="/admin/lead-notifications"
              />
            </>
          )}
        </div>
      </Section>

      <Section title="Activity & growth">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {isLoading || !data ? (
            <><StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton /></>
          ) : (
            <>
              <Stat label="Active users (7d)" value={data.activeUsers7d} icon={Users} tone="primary" to="/admin/activity" />
              <Stat label="New this week" value={data.newUsersWeek} icon={UserPlus} to="/admin/activity" />
              <Stat label="New this month" value={data.newUsersMonth} icon={UserPlus} to="/admin/activity" />
              <Stat label="Coins in circulation" value={data.coinsInCirculation.toLocaleString()} icon={Coins} tone="success" to="/admin/coins" />
            </>
          )}
        </div>
      </Section>

      <Section title="Economy (today)">
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
          {isLoading || !data ? (
            <><StatSkeleton /><StatSkeleton /></>
          ) : (
            <>
              <Stat label="Coins purchased" value={data.coinPurchasesToday} icon={Coins} tone="success" to="/admin/coins" />
              <Stat label="Coins spent" value={data.coinSpendingToday} icon={TrendingDown} tone="warning" to="/admin/coins" />
            </>
          )}
        </div>
      </Section>


      <Card className="border-border/60 shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-muted-foreground" />
            Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading || !data ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : data.recentActivity.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No activity yet.
            </div>
          ) : (
            <ul className="divide-y">
              {data.recentActivity.map((a: any) => (
                <li
                  key={a.id}
                  className="px-5 py-3 text-sm flex items-start justify-between gap-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.action}</div>
                    <div className="text-muted-foreground text-xs truncate">
                      {a.entity_type ?? "—"} · {a.entity_id ?? "—"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AdminPage>
  );
}
