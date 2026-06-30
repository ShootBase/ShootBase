import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { AdminPage } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { listTickets, listAssignableStaff } from "@/lib/admin/support.functions";
import { UserCircle2, Timer } from "lucide-react";
import {
  computeSla,
  formatCountdown,
  SLA_LABEL,
  SLA_DOT,
  PRIORITY_BADGE,
  priorityLabel,
  type SlaPriority,
  SENTIMENT_BADGE,
  SENTIMENT_LABEL,
  type Sentiment,
} from "@/lib/admin/sla";



type TicketStatus = "all" | "open" | "in_progress" | "resolved" | "closed";

export const Route = createFileRoute("/_authenticated/admin/tickets")({
  validateSearch: (s: Record<string, unknown>): { status: TicketStatus } => ({
    status: (["all","open","in_progress","resolved","closed"] as const).includes(s.status as any)
      ? (s.status as TicketStatus)
      : "all",
  }),
  component: TicketsPage,
});

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "Pending",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_DOT: Record<string, string> = {
  open: "bg-red-500",
  in_progress: "bg-amber-500",
  resolved: "bg-emerald-500",
  closed: "bg-muted-foreground/40",
};

function statusVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "open") return "destructive";
  if (s === "in_progress") return "default";
  if (s === "resolved") return "secondary";
  return "outline";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function TicketRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

function TicketsPage() {
  const fn = useServerFn(listTickets);
  const staffFn = useServerFn(listAssignableStaff);
  const qc = useQueryClient();
  const initial = Route.useSearch();
  const [status, setStatus] = useState<TicketStatus>(initial.status);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [assigned, setAssigned] = useState<string>("all");
  const assignedFilter = assigned.startsWith("user:") ? "user" : (assigned as "all" | "mine" | "unassigned");
  const assignedUserId = assigned.startsWith("user:") ? assigned.slice(5) : undefined;
  const [sentiment, setSentiment] = useState<"all" | Sentiment>("all");
  const [overridden, setOverridden] = useState<"all" | "ai" | "manual">("all");
  const [sort, setSort] = useState<"priority" | "recent">("priority");
  const [role, setRole] = useState<"all" | "client" | "pro">("all");
  const [priority, setPriority] = useState<"all" | "low" | "medium" | "high" | "urgent">("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const selectedId = pathname.startsWith("/admin/tickets/")
    ? pathname.split("/admin/tickets/")[1]?.split("/")[0] || null
    : null;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-tickets", status, q, page, assigned, sentiment, overridden, sort, role, priority, dateFrom, dateTo],
    queryFn: () =>
      fn({
        data: {
          status,
          q: q || undefined,
          page,
          assigned: assignedFilter,
          assigned_user_id: assignedUserId,
          sentiment,
          overridden,
          sort,
          role,
          priority,
          date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
          date_to: dateTo ? new Date(dateTo + "T23:59:59").toISOString() : undefined,
        },
      }),
  });

  const canManage = data?.canManage ?? false;
  const { data: staffList } = useQuery({
    queryKey: ["admin-assignable-staff"],
    queryFn: () => staffFn(),
    enabled: canManage,
  });


  // Real-time: refresh the inbox whenever a ticket or reply changes.
  useEffect(() => {
    const channel = supabase
      .channel("admin-tickets-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_requests" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-tickets"] });
        qc.invalidateQueries({ queryKey: ["admin-overview"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_notes" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-tickets"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const rows = data?.rows ?? [];

  return (
    <AdminPage
      title="Support inbox"
      description="All tickets submitted from /help — manage replies and status."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.35fr)] lg:items-start">
      <section className={`${selectedId ? "hidden lg:block" : "block"} min-w-0 space-y-4`} aria-label="Support ticket list">
      {/* Filter bar */}
      <Card className="p-3 border-border/60 shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center">
          <div className="relative col-span-2 sm:col-span-3 lg:col-span-1 lg:min-w-0 lg:flex-1 lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by email, name, message, or ID…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              className="pl-9 h-9 w-full"
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
            <SelectTrigger className="w-full lg:w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">Pending</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assigned} onValueChange={(v) => { setAssigned(v); setPage(1); }}>
            <SelectTrigger className="w-full lg:w-48 h-9"><SelectValue placeholder="Assignment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tickets</SelectItem>
              <SelectItem value="mine">Assigned to me</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {canManage && (staffList?.staff ?? []).map((s) => (
                <SelectItem key={s.user_id} value={`user:${s.user_id}`}>
                  {s.full_name ?? s.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sentiment} onValueChange={(v) => { setSentiment(v as any); setPage(1); }}>
            <SelectTrigger className="w-full lg:w-40 h-9"><SelectValue placeholder="Sentiment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sentiment</SelectItem>
              <SelectItem value="angry">😠 Angry</SelectItem>
              <SelectItem value="frustrated">😕 Frustrated</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="positive">🙂 Positive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={overridden} onValueChange={(v) => { setOverridden(v as any); setPage(1); }}>
            <SelectTrigger className="w-full lg:w-40 h-9"><SelectValue placeholder="Priority source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any priority source</SelectItem>
              <SelectItem value="ai">AI-classified</SelectItem>
              <SelectItem value="manual">Manually overridden</SelectItem>
            </SelectContent>
          </Select>
          <Select value={role} onValueChange={(v) => { setRole(v as any); setPage(1); }}>
            <SelectTrigger className="w-full lg:w-32 h-9"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="pro">Professional</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={(v) => { setPriority(v as any); setPage(1); }}>
            <SelectTrigger className="w-full lg:w-32 h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any priority</SelectItem>
              <SelectItem value="urgent">🔴 Urgent</SelectItem>
              <SelectItem value="high">🟠 High</SelectItem>
              <SelectItem value="medium">🟡 Medium</SelectItem>
              <SelectItem value="low">🟢 Low</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="h-9 w-full lg:w-[140px]"
            title="From date"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="h-9 w-full lg:w-[140px]"
            title="To date"
          />
          <Select value={sort} onValueChange={(v) => setSort(v as any)}>
            <SelectTrigger className="w-full lg:w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Priority first</SelectItem>
              <SelectItem value="recent">Most recent</SelectItem>
            </SelectContent>
          </Select>
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 lg:ml-auto text-xs text-muted-foreground self-center">
            {isFetching ? "Loading…" : `${data?.total ?? 0} total`}
          </div>
        </div>
      </Card>


      {/* Inbox list */}
      <Card className="overflow-hidden border-border/60 shadow-sm">
        {isLoading ? (
          <div>
            {Array.from({ length: 6 }).map((_, i) => <TicketRowSkeleton key={i} />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <div className="font-medium">No tickets</div>
              <div className="text-sm text-muted-foreground">
                Try changing the status filter or search.
              </div>
            </div>
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((t: any) => {
              const unresolved = t.status === "open" || t.status === "in_progress";
              const sla = computeSla(t, now);
              const slaActive = unresolved && (sla.overall === "due_soon" || sla.overall === "overdue");
              // Pick the most pressing countdown for display
              const respPending = !t.first_responded_at;
              const focus = respPending ? sla.response : sla.resolution;
              const isUnread =
                !t.admin_viewed_at ||
                new Date(t.admin_viewed_at).getTime() <
                  new Date(t.updated_at ?? t.created_at).getTime();
              const preview = (t.message ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
              return (

                <li key={t.id}>
                  <Link
                    to="/admin/tickets/$id"
                    params={{ id: t.id }}
                    aria-current={selectedId === t.id ? "page" : undefined}
                    className={`group flex cursor-pointer items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      selectedId === t.id
                        ? "bg-primary/10 ring-1 ring-inset ring-primary/30"
                        : t.ai_sentiment === "angry"
                        ? "bg-red-500/[0.04]"
                        : ""
                    }`}
                  >
                    {/* Priority/sentiment bar */}
                    <span
                      className={`h-10 w-1 rounded-full shrink-0 ${
                        t.priority === "urgent"
                          ? "bg-red-500"
                          : t.priority === "high"
                          ? "bg-amber-500"
                          : unresolved
                          ? "bg-primary"
                          : "bg-transparent"
                      }`}
                      aria-hidden
                    />
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-muted text-xs font-medium">
                        {initials(t.name, t.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {isUnread && (
                          <span
                            className="h-2 w-2 rounded-full bg-primary shrink-0"
                            aria-label="Unread"
                            title="Unread — new activity since you last opened"
                          />
                        )}
                        <span className={`truncate text-sm ${isUnread ? "font-semibold" : "font-medium"}`}>
                          {t.name ?? t.email ?? "Unknown"}
                        </span>
                        {t.role && (
                          <Badge variant="secondary" className="hidden sm:inline-flex h-5 px-1.5 text-[10px] font-normal capitalize">
                            {t.role}
                          </Badge>
                        )}
                        {t.category && (
                          <Badge variant="outline" className="hidden sm:inline-flex h-5 px-1.5 text-[10px] font-normal">
                            {t.category}
                          </Badge>
                        )}
                        <Badge
                          className={`h-5 px-1.5 text-[10px] font-medium border-0 ${PRIORITY_BADGE[(t.priority ?? "medium") as SlaPriority]}`}
                          title={t.priority_overridden ? "Set by admin (AI suggested differently)" : "AI classified"}
                        >
                          {priorityLabel(t.priority)}
                          {!t.priority_overridden && t.ai_priority && <span className="ml-1 opacity-70">✨</span>}
                        </Badge>
                        {t.ai_sentiment && t.ai_sentiment !== "neutral" && (
                          <Badge
                            className={`h-5 px-1.5 text-[10px] font-medium border-0 ${SENTIMENT_BADGE[t.ai_sentiment as Sentiment]}`}
                            title={`Customer sentiment: ${SENTIMENT_LABEL[t.ai_sentiment as Sentiment]}`}
                          >
                            {t.ai_sentiment === "angry" ? "😠" : t.ai_sentiment === "frustrated" ? "😕" : "🙂"}
                            <span className="ml-1">{SENTIMENT_LABEL[t.ai_sentiment as Sentiment]}</span>
                          </Badge>
                        )}
                        {unresolved && (
                          <span
                            className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] font-medium ${
                              sla.overall === "overdue"
                                ? "bg-red-500/15 text-red-700 dark:text-red-300"
                                : sla.overall === "due_soon"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            }`}
                            title={`Response ${SLA_LABEL[sla.response.status]} · Resolution ${SLA_LABEL[sla.resolution.status]}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${SLA_DOT[sla.overall]}`} />
                            {SLA_LABEL[sla.overall]}
                            {slaActive && focus.msRemaining !== null && (
                              <span className="ml-0.5 inline-flex items-center gap-0.5 opacity-90">
                                <Timer className="h-2.5 w-2.5" />
                                {formatCountdown(focus.msRemaining)}
                              </span>
                            )}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {timeAgo(t.updated_at ?? t.created_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 min-w-0">

                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[t.status] ?? "bg-muted"}`} />
                          <Badge
                            variant={statusVariant(t.status)}
                            className="h-4 px-1.5 text-[10px] font-medium"
                          >
                            {STATUS_LABEL[t.status] ?? t.status}
                          </Badge>
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {t.email ?? `#${t.id.slice(0, 8)}`}
                        </span>
                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] shrink-0">
                          <UserCircle2 className="h-3 w-3" />
                          {t.assignee ? (
                            <span className="text-foreground/80 font-medium truncate max-w-[120px]">
                              {t.assignee.full_name ?? t.assignee.email}
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              Unassigned
                            </span>
                          )}
                        </span>

                      </div>
                      {preview && (
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
                          {preview}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Pagination */}
      <div className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      </section>
      <section className={`${selectedId ? "block" : "hidden lg:block"} min-w-0`} aria-label="Support conversation">
        <Outlet />
      </section>
      </div>
    </AdminPage>
  );
}
