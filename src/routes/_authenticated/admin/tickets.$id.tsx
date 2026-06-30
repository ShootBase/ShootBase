import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Send, StickyNote, Mail, ShieldCheck, User } from "lucide-react";
import { PermissionGate } from "@/components/admin/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getTicket,
  replyTicket,
  retryTicketReplyEmail,
  updateTicketStatus,
  addInternalNote,
  assignTicket,
  listAssignableStaff,
  updateTicketPriority,
} from "@/lib/admin/support.functions";
import { UserCircle2, Timer, AlertTriangle } from "lucide-react";
import {
  computeSla,
  formatCountdown,
  SLA_LABEL,
  SLA_DOT,
  PRIORITY_BADGE,
  priorityLabel,
  type SlaPriority,
  SENTIMENT_LABEL,
  SENTIMENT_BADGE,
  type Sentiment,
} from "@/lib/admin/sla";



export const Route = createFileRoute("/_authenticated/admin/tickets/$id")({
  component: TicketDetail,
  errorComponent: TicketErrorComponent,
});

function TicketErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const msg = String(error?.message ?? "");
  const notFound = /not found/i.test(msg);
  const forbidden = /forbidden|unauthor/i.test(msg);
  return (
    <div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted">
        <AlertTriangle className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">
        {notFound ? "Ticket not found" : forbidden ? "You do not have permission to view this" : "Something went wrong loading this ticket"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {notFound
          ? "This ticket may have been deleted or the link is out of date."
          : forbidden
          ? "Ask a Super Admin if you believe this is a mistake."
          : "Please try again in a moment."}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/tickets">Back to tickets</Link>
        </Button>
        {!notFound && !forbidden && (
          <Button size="sm" onClick={() => reset()}>Try again</Button>
        )}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "Pending",
  resolved: "Resolved",
  closed: "Closed",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}
function initials(s?: string | null) {
  const src = (s || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

interface ThreadItem {
  kind: "user" | "admin";
  id: string;
  body: string;
  created_at: string;
  meta?: string | null;
  email_sent?: boolean;
  email_status?: string | null;
  email_error?: string | null;
}

function TicketDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(getTicket);
  const reply = useServerFn(replyTicket);
  const retryEmail = useServerFn(retryTicketReplyEmail);
  const [retrying, setRetrying] = useState<string | null>(null);

  async function handleRetryEmail(replyId: string) {
    setRetrying(replyId);
    try {
      const res: any = await retryEmail({ data: { id, reply_id: replyId } });
      if (res?.ok) {
        toast.success("Email re-queued");
      } else {
        toast.error(`Retry failed: ${res?.error ?? "unknown error"}`);
      }
      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
    } catch (err: any) {
      toast.error(err?.message ?? "Retry failed");
    } finally {
      setRetrying(null);
    }
  }
  const note = useServerFn(addInternalNote);
  const upd = useServerFn(updateTicketStatus);
  const assign = useServerFn(assignTicket);
  const staffFn = useServerFn(listAssignableStaff);
  const setPriority = useServerFn(updateTicketPriority);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-ticket", id],
    queryFn: () => get({ data: { id } }),
  });
  const { data: staffList } = useQuery({
    queryKey: ["admin-assignable-staff"],
    queryFn: () => staffFn(),
  });

  const [replyBody, setReplyBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);


  // Real-time: refresh this ticket when its row or replies/notes change.
  useEffect(() => {
    const channel = supabase
      .channel(`admin-ticket-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_requests", filter: `id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["admin-ticket", id] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_notes", filter: `support_request_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["admin-ticket", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const thread: ThreadItem[] = useMemo(() => {
    if (!data) return [];
    const items: ThreadItem[] = [];
    items.push({
      kind: "user",
      id: data.ticket.id,
      body: data.ticket.message,
      created_at: data.ticket.created_at,
      meta: data.ticket.email ?? data.ticket.name ?? null,
    });
    for (const r of data.replies as any[]) {
      items.push({
        kind: r.author_user_id ? "admin" : "user",
        id: r.id,
        body: r.body,
        created_at: r.created_at,
        meta: r.author_user_id ? null : (data.ticket.email ?? null),
        email_sent: !!r.email_sent,
        email_status: r.email_status ?? null,
        email_error: r.email_error ?? null,
      });
    }
    items.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    return items;
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const t = data.ticket;
  const isOpen = t.status === "open" || t.status === "in_progress";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ticket #{t.id.slice(0, 8)} · opened {fmt(t.created_at)}
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            {t.category ? t.category : "Support request"}
          </h2>
        </div>
        <Button asChild variant="outline" size="sm" className="lg:hidden">
          <Link to="/admin/tickets">
            <ArrowLeft className="h-4 w-4" />
            Back to inbox
          </Link>
        </Button>
      </div>
      {/* Header summary */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-start sm:flex sm:flex-wrap sm:justify-between sm:items-center">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-11 w-11 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {initials(t.name ?? t.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-semibold truncate">{t.name ?? "Unknown"}</div>
                <div className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  {t.email && (
                    <a href={`mailto:${t.email}`} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                      <Mail className="h-3.5 w-3.5" />
                      {t.email}
                    </a>
                  )}
                  {t.role && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="capitalize">{t.role}</span>
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Last updated {fmt(t.updated_at ?? t.created_at)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:shrink-0">
              <Badge
                variant={isOpen ? "default" : "secondary"}
                className="gap-1.5 px-2.5 py-1"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    t.status === "open"
                      ? "bg-red-500"
                      : t.status === "in_progress"
                      ? "bg-amber-500"
                      : t.status === "resolved"
                      ? "bg-emerald-500"
                      : "bg-muted-foreground"
                  }`}
                />
                {STATUS_LABEL[t.status] ?? t.status}
              </Badge>
              <PermissionGate perm="tickets.manage">
                <Select
                  value={t.status}
                  onValueChange={async (v) => {
                    try {
                      await upd({ data: { id, status: v as any } });
                      toast.success("Status updated");
                      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
                      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  <SelectTrigger className="flex-1 min-w-[8rem] sm:flex-none sm:w-36 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">Pending</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </PermissionGate>
              <PermissionGate perm="tickets.manage">
                <Select
                  value={t.assigned_to ?? "__unassigned"}
                  onValueChange={async (v) => {
                    try {
                      await assign({
                        data: { id, assignee_user_id: v === "__unassigned" ? null : v },
                      });
                      toast.success(v === "__unassigned" ? "Ticket unassigned" : "Ticket assigned");
                      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
                      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  <SelectTrigger className="flex-1 min-w-[10rem] sm:flex-none sm:w-48 h-9">
                    <UserCircle2 className="h-4 w-4 mr-1" />
                    <SelectValue placeholder="Assign…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned">Unassigned</SelectItem>
                    {(staffList?.staff ?? []).map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.full_name ?? s.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PermissionGate>
              <PermissionGate perm="tickets.manage">
                <Select
                  value={(t.priority ?? "medium") as string}
                  onValueChange={async (v) => {
                    try {
                      await setPriority({ data: { id, priority: v as SlaPriority } });
                      toast.success("Priority updated");
                      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
                      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  <SelectTrigger className="flex-1 min-w-[8rem] sm:flex-none sm:w-36 h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </PermissionGate>
            </div>
          </div>

          {t.assignee && (
            <div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex items-center gap-1.5">
              <UserCircle2 className="h-3.5 w-3.5" />
              Assigned to{" "}
              <span className="font-medium text-foreground">
                {t.assignee.full_name ?? t.assignee.email}
              </span>
              {t.assigned_at && <span>· {fmt(t.assigned_at)}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SLA card */}
      {(() => {
        const sla = computeSla(t, now);
        const Cell = ({
          label,
          metric,
          metLabel,
        }: {
          label: string;
          metric: ReturnType<typeof computeSla>["response"];
          metLabel: string;
        }) => {
          const isMet = metric.status === "met";
          return (
            <div className="flex-1 min-w-[180px] rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <span
                  className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] font-medium ${
                    metric.status === "overdue"
                      ? "bg-red-500/15 text-red-700 dark:text-red-300"
                      : metric.status === "due_soon"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      : metric.status === "met"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${SLA_DOT[metric.status]}`} />
                  {SLA_LABEL[metric.status]}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <Timer className="h-4 w-4 text-muted-foreground" />
                {isMet ? (
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {metLabel}
                  </span>
                ) : (
                  <span
                    className={`font-mono font-semibold ${
                      metric.status === "overdue"
                        ? "text-red-600 dark:text-red-400"
                        : metric.status === "due_soon"
                        ? "text-amber-600 dark:text-amber-400"
                        : ""
                    }`}
                  >
                    {formatCountdown(metric.msRemaining)}
                  </span>
                )}
              </div>
              {metric.dueAt && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Due {fmt(metric.dueAt)}
                </div>
              )}
            </div>
          );
        };
        return (
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="border-b py-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Timer className="h-4 w-4" /> SLA timers
                <Badge
                  className={`border-0 ${PRIORITY_BADGE[(t.priority ?? "medium") as SlaPriority]}`}
                >
                  {priorityLabel(t.priority)}
                </Badge>
              </CardTitle>
              {sla.overall === "overdue" && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  SLA breached
                </span>
              )}
            </CardHeader>
            <CardContent className="p-4 flex flex-wrap gap-3">
              <Cell label="First response" metric={sla.response} metLabel="Responded on time" />
              <Cell label="Resolution" metric={sla.resolution} metLabel="Resolved on time" />
            </CardContent>
          </Card>
        );
      })()}

      {/* AI triage insight */}
      {(t.ai_classified_at || t.ai_priority || t.ai_sentiment) && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              ✨ AI triage
              {t.priority_overridden && (
                <Badge variant="outline" className="ml-2 font-normal text-[10px]">
                  Admin overrode AI
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                AI suggested priority
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  className={`border-0 ${PRIORITY_BADGE[(t.ai_priority ?? "medium") as SlaPriority]}`}
                >
                  {priorityLabel(t.ai_priority)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t.ai_priority_confidence ?? 0}% confidence
                </span>
              </div>
              {t.priority_overridden && t.ai_priority && t.ai_priority !== t.priority && (
                <div className="text-[11px] text-muted-foreground mt-1.5">
                  Current priority is {priorityLabel(t.priority)} (set by admin)
                </div>
              )}
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Customer sentiment
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`border-0 ${SENTIMENT_BADGE[(t.ai_sentiment ?? "neutral") as Sentiment]}`}>
                  {SENTIMENT_LABEL[(t.ai_sentiment ?? "neutral") as Sentiment]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t.ai_sentiment_confidence ?? 0}% confidence
                </span>
              </div>
              {(t.ai_sentiment === "angry" || t.ai_sentiment === "frustrated") && (
                <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Handle with care — customer is {t.ai_sentiment}.
                </div>
              )}
            </div>
            {t.ai_reasoning && (
              <div className="sm:col-span-2 text-xs text-muted-foreground italic">
                "{t.ai_reasoning}"
              </div>
            )}
            {Array.isArray(t.ai_keywords) && t.ai_keywords.length > 0 && (
              <div className="sm:col-span-2 flex flex-wrap gap-1">
                {t.ai_keywords.map((k: string) => (
                  <Badge key={k} variant="outline" className="font-normal text-[10px]">
                    {k}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}





      {/* Conversation — Intercom/Gmail style */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Conversation
            <Badge variant="outline" className="font-normal">{thread.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 space-y-4 bg-muted/20">
          {thread.map((m) => {
            const isAdmin = m.kind === "admin";
            return (
              <div
                key={`${m.kind}-${m.id}`}
                className={`flex gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300 ${
                  isAdmin ? "flex-row-reverse" : "flex-row"
                }`}
              >
                <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                  <AvatarFallback
                    className={
                      isAdmin
                        ? "bg-primary text-primary-foreground text-[10px]"
                        : "bg-muted text-[10px]"
                    }
                  >
                    {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className={`max-w-[80%] min-w-0 ${isAdmin ? "items-end" : "items-start"} flex flex-col`}>
                  <div
                    className={`flex items-center gap-2 mb-1 text-xs ${
                      isAdmin ? "flex-row-reverse" : ""
                    }`}
                  >
                    <span className="font-medium text-foreground">
                      {isAdmin ? "Shootbase Support" : (m.meta || "User")}
                    </span>
                    <span className="text-muted-foreground">{fmt(m.created_at)}</span>
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                      isAdmin
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-card border border-border/60 rounded-tl-sm"
                    }`}
                  >
                    {m.body}
                  </div>
                  {isAdmin && (m.email_status || m.email_sent) && (
                    <div className={`mt-1.5 flex items-center gap-2 text-[11px] ${isAdmin ? "flex-row-reverse" : ""}`}>
                      {m.email_sent || m.email_status === "sent" ? (
                        <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 font-normal">
                          ✓ Email sent
                        </Badge>
                      ) : m.email_status === "pending" ? (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 font-normal">
                          Email sending…
                        </Badge>
                      ) : m.email_status === "no_recipient" ? (
                        <Badge variant="outline" className="border-muted-foreground/30 bg-muted text-muted-foreground font-normal">
                          No recipient email
                        </Badge>
                      ) : (
                        <>
                          <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700 font-normal" title={m.email_error ?? undefined}>
                            ⚠ Email failed
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[11px]"
                            disabled={retrying === m.id}
                            onClick={() => handleRetryEmail(m.id)}
                          >
                            {retrying === m.id ? "Retrying…" : "Retry"}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Reply composer */}
      <PermissionGate perm="tickets.reply">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              Reply to user
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <Textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={5}
              placeholder="Type your reply… The user will receive this by email."
              className="resize-none"
            />
            <Separator />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Sent to {t.email ?? "—"}
              </span>
              <Button
                disabled={!replyBody.trim() || sending}
                onClick={async () => {
                  setSending(true);
                  try {
                    const sent = await reply({ data: { id, body: replyBody } });
                    toast.success(sent?.emailQueued ? "Reply sent and email queued" : "Reply saved; email could not be queued");
                    qc.setQueryData(["admin-ticket", id], (current: any) => {
                      if (!current || !sent?.reply) return current;
                      return {
                        ...current,
                        ticket: {
                          ...current.ticket,
                          status: current.ticket.status === "open" ? "in_progress" : current.ticket.status,
                          first_responded_at: current.ticket.first_responded_at ?? sent.reply.created_at,
                          updated_at: sent.reply.created_at,
                        },
                        replies: [...(current.replies ?? []), sent.reply],
                      };
                    });
                    setReplyBody("");
                    qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
                    qc.invalidateQueries({ queryKey: ["admin-tickets"] });
                  } catch (e: any) {
                    toast.error(e.message);
                  } finally {
                    setSending(false);
                  }
                }}
              >
                <Send className="h-4 w-4" />
                {sending ? "Sending…" : "Send reply"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Internal notes */}
        <Card className="border-amber-500/20 bg-amber-50/30 dark:bg-amber-950/10 shadow-sm">
          <CardHeader className="border-b border-amber-500/20 py-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Internal notes
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Only visible to admins. Never sent to the user.
            </p>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {data.notes.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">No notes yet.</div>
            ) : (
              <ul className="space-y-2">
                {data.notes.map((n: any) => (
                  <li
                    key={n.id}
                    className="rounded-lg bg-card border border-amber-500/20 p-3 text-sm"
                  >
                    <div className="text-xs text-muted-foreground mb-1">{fmt(n.created_at)}</div>
                    <div className="whitespace-pre-wrap">{n.body}</div>
                  </li>
                ))}
              </ul>
            )}
            <Textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={3}
              placeholder="Add an internal note…"
              className="resize-none bg-card"
            />
            <div className="flex justify-end">
              <Button
                variant="secondary"
                disabled={!noteBody.trim()}
                onClick={async () => {
                  try {
                    await note({ data: { id, body: noteBody } });
                    toast.success("Note added");
                    setNoteBody("");
                    qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                }}
              >
                <StickyNote className="h-4 w-4" />
                Add note
              </Button>
            </div>
          </CardContent>
        </Card>
      </PermissionGate>
    </div>
  );
}
