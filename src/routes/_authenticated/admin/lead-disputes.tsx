import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  adminListDisputes,
  adminDisputeMetrics,
  adminGetDisputeEvents,
  adminGetDisputeDebug,
  adminRunTwilioCheck,
  adminResolveLeadReport,
  adminRetryDisputeEmail,
  type AdminDisputeRow,
  type AdminDisputeMetrics,
  type AdminDisputeEvent,
  type AdminDisputeDebug,
} from "@/lib/lead-reports.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/lead-disputes")({
  head: () => ({
    meta: [
      { title: "Project Disputes — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLeadDisputesPage,
});

type StatusFilter = "all" | "pending" | "approved" | "rejected";
type ReasonFilter = "all" | "disconnected" | "wrong_number";

const PAGE_SIZE = 25;

function AdminLeadDisputesPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [reason, setReason] = useState<ReasonFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminDisputeRow[] | null>(null);
  const [metrics, setMetrics] = useState<AdminDisputeMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<AdminDisputeRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setRows(null);
    setError(null);
    try {
      const [list, met] = await Promise.all([
        adminListDisputes({
          data: {
            status,
            reason,
            from: from ? new Date(from).toISOString() : undefined,
            to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
            search: search || undefined,
          },
        }),
        adminDisputeMetrics(),
      ]);
      setRows(list);
      setMetrics(met);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, reason, from, to]);

  async function runTwilio(reportId: string) {
    setBusy("twilio:" + reportId);
    try {
      const { result } = await adminRunTwilioCheck({ data: { report_id: reportId } });
      toast.success(`Twilio check: ${result}`);
      // Patch in place
      setRows((cur) =>
        cur?.map((r) =>
          r.id === reportId
            ? { ...r, twilio_status: result, twilio_checked_at: new Date().toISOString() }
            : r,
        ) ?? cur,
      );
      if (openRow?.id === reportId) {
        setOpenRow({ ...openRow, twilio_status: result, twilio_checked_at: new Date().toISOString() });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Twilio check failed");
    } finally {
      setBusy(null);
    }
  }

  async function resolve(reportId: string, decision: "approve" | "reject", note: string) {
    if (decision === "reject" && !note.trim()) {
      toast.error("Add a note explaining why the dispute was rejected.");
      return;
    }
    setBusy("resolve:" + reportId);
    try {
      await adminResolveLeadReport({ data: { report_id: reportId, decision, note } });
      toast.success(decision === "approve" ? "Refund approved" : "Dispute rejected");
      const resolvedAt = new Date().toISOString();
      setOpenRow((cur) =>
        cur?.id === reportId
          ? {
              ...cur,
              status: decision === "approve" ? "approved" : "rejected",
              resolved_at: cur.resolved_at ?? resolvedAt,
              resolution_note: note || cur.resolution_note,
              last_email_status: "pending",
              last_email_at: resolvedAt,
              last_email_kind: decision,
            }
          : cur,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const totalPages = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1;
  const pageRows = useMemo(
    () => (rows ? rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : []),
    [rows, page],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Project disputes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Investigate and resolve refund requests from professionals. Twilio results inform —
            you decide.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </header>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Pending" value={metrics?.pending ?? "—"} tone="amber" />
        <MetricCard label="Approved refunds" value={metrics?.approved ?? "—"} tone="emerald" />
        <MetricCard label="Rejected" value={metrics?.rejected ?? "—"} tone="muted" />
        <MetricCard label="Credits refunded" value={metrics?.credits_refunded ?? "—"} tone="blue" />
        <MetricCard label="High-risk projects" value={metrics?.high_risk_leads ?? "—"} tone="rose" />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 border rounded-lg bg-card">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Reason</label>
          <Select value={reason} onValueChange={(v) => setReason(v as ReasonFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="disconnected">Disconnected</SelectItem>
              <SelectItem value="wrong_number">Wrong number</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Search</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <Input
              placeholder="Project ID, pro, phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded border border-destructive/30 bg-destructive/5 text-sm">
          {error}
        </div>
      )}

      {rows === null && !error && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading disputes…
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="text-sm text-muted-foreground p-10 border rounded text-center">
          No disputes match these filters.
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="border rounded-xl overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Report</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Professional</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Email Sent</TableHead>
                <TableHead>Email Status</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString("en-GB")}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">
                    {r.id.slice(0, 8)}
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <div className="truncate font-medium text-sm">{r.job_title}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <span className="font-mono">{r.job_id.slice(0, 8)}</span>
                      {r.job_event_type && <span>· {r.job_event_type}</span>}
                      {r.reports_for_job >= 2 && (
                        <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                          {r.reports_for_job}× reported
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{r.business_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    <div>{r.customer_name ?? "—"}</div>
                    <div className="text-muted-foreground">{r.customer_phone ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-xs capitalize">
                    {r.reason === "wrong_number" ? "Wrong number" : "Disconnected"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell>
                    <LastEmailSentCell row={r} />
                  </TableCell>
                  <TableCell>
                    <EmailStatusCell row={r} />
                  </TableCell>
                  <TableCell>
                    <TwilioCell row={r} busy={busy} onCheck={() => runTwilio(r.id)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setOpenRow(r)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between p-3 border-t text-xs">
            <span className="text-muted-foreground">
              {rows.length} report{rows.length === 1 ? "" : "s"} · page {page} / {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {openRow && (
        <DisputeDrawer
          row={openRow}
          busy={busy}
          onClose={() => setOpenRow(null)}
          onTwilio={() => runTwilio(openRow.id)}
          onResolve={(decision, note) => resolve(openRow.id, decision, note)}
        />
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "amber" | "emerald" | "muted" | "blue" | "rose";
}) {
  const tones: Record<string, string> = {
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    muted: "text-foreground",
    blue: "text-blue-700",
    rose: "text-rose-700",
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold ${tones[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: AdminDisputeRow["status"] }) {
  if (status === "approved")
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Approved</Badge>;
  if (status === "rejected") return <Badge variant="secondary">Rejected</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>;
}

function EmailStatusCell({ row }: { row: AdminDisputeRow }) {
  if (!row.last_email_at) {
    return <span className="text-[11px] text-muted-foreground">No email yet</span>;
  }
  const isOk = row.last_email_status === "delivered";
  const isPending = row.last_email_status === "pending";
  return (
    <Badge
      className={
        isOk
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 w-fit"
          : isPending
          ? "bg-amber-100 text-amber-800 hover:bg-amber-100 w-fit"
          : "bg-rose-100 text-rose-800 hover:bg-rose-100 w-fit"
      }
    >
      {isOk ? "✓ Delivered" : isPending ? "⏳ Pending" : "❌ Failed"}
    </Badge>
  );
}

function LastEmailSentCell({ row }: { row: AdminDisputeRow }) {
  if (!row.last_email_at) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  const label =
    row.last_email_kind === "submitted"
      ? "Submission"
      : row.last_email_kind === "approve"
      ? "Approval"
      : row.last_email_kind === "reject"
      ? "Rejection"
      : "Email";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium">{label}</span>
      <span className="text-[10px] text-muted-foreground">
        {new Date(row.last_email_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
      </span>
    </div>
  );
}

function TwilioCell({
  row,
  busy,
  onCheck,
}: {
  row: AdminDisputeRow;
  busy: string | null;
  onCheck: () => void;
}) {
  const checking = busy === "twilio:" + row.id;
  if (!row.twilio_status) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">Not checked</span>
        <Button size="sm" variant="outline" disabled={checking} onClick={onCheck} className="h-7 text-xs">
          {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : "Run Twilio check"}
        </Button>
      </div>
    );
  }
  return <TwilioBadge status={row.twilio_status} />;
}

function TwilioBadge({ status }: { status: "inactive" | "active" | "unknown" }) {
  if (status === "inactive")
    return (
      <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
        <span className="mr-1">🔴</span> Inactive
      </Badge>
    );
  if (status === "active")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        <span className="mr-1">🟢</span> Active mobile
      </Badge>
    );
  return (
    <Badge variant="secondary">
      <span className="mr-1">⚪</span> Unable to determine
    </Badge>
  );
}

function TwilioRecommendation({ status }: { status: "inactive" | "active" | "unknown" | null }) {
  if (!status) return null;
  if (status === "inactive")
    return (
      <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2 text-xs">
        <CheckCircle2 className="h-4 w-4" /> Recommended: Approve refund
      </div>
    );
  if (status === "active")
    return (
      <div className="flex items-center gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 text-xs">
        <AlertTriangle className="h-4 w-4" /> Recommended: Review manually
      </div>
    );
  return (
    <div className="flex items-center gap-2 text-muted-foreground bg-muted/40 border rounded p-2 text-xs">
      <CircleDashed className="h-4 w-4" /> Manual review required
    </div>
  );
}

function DisputeDrawer({
  row,
  busy,
  onClose,
  onTwilio,
  onResolve,
}: {
  row: AdminDisputeRow;
  busy: string | null;
  onClose: () => void;
  onTwilio: () => void;
  onResolve: (decision: "approve" | "reject", note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [events, setEvents] = useState<AdminDisputeEvent[] | null>(null);
  const [debug, setDebug] = useState<AdminDisputeDebug | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);

  function refreshDiagnostics() {
    setEvents(null);
    setDebug(null);
    setDebugError(null);
    void adminGetDisputeEvents({ data: { report_id: row.id } })
      .then(setEvents)
      .catch(() => setEvents([]));
    void adminGetDisputeDebug({ data: { report_id: row.id } })
      .then(setDebug)
      .catch((e) => {
        setDebugError(e instanceof Error ? e.message : "Diagnostics unavailable");
        setDebug(null);
      });
  }

  useEffect(() => {
    refreshDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, row.status, row.last_email_at]);

  const checking = busy === "twilio:" + row.id;
  const resolving = busy === "resolve:" + row.id;

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Report details</SheetTitle>
          <SheetDescription>
            <span className="font-mono text-xs">{row.id}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-4">
          {row.reports_for_job >= 2 && (
            <div className="border border-rose-200 bg-rose-50 text-rose-800 rounded p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <div>
                <div className="font-medium">High-risk project</div>
                <div className="text-xs">
                  {row.reports_for_job} reports submitted against this project.
                </div>
              </div>
            </div>
          )}

          <Section title="Project">
            <Field label="Title" value={row.job_title} />
            <Field label="Project ID" value={row.job_id} mono />
            <Field label="Category" value={row.job_event_type ?? "—"} />
            <Field label="Quality status" value={row.job_quality_status ?? "active"} />
          </Section>

          <Section title="Professional">
            <Field label="Business" value={row.business_name ?? "—"} />
            <Field label="Professional ID" value={row.professional_id} mono />
          </Section>

          <Section title="Client contact">
            <Field label="Name" value={row.customer_name ?? "—"} />
            <Field label="Phone" value={row.customer_phone ?? "—"} />
          </Section>

          <Section title="Submitted reason">
            <Field
              label="Reason"
              value={row.reason === "wrong_number" ? "Wrong number" : "Disconnected"}
            />
            <Field
              label="Attempts"
              value={[row.attempted_call && "called", row.attempted_sms && "SMS"]
                .filter(Boolean)
                .join(" / ") || "—"}
            />
            <Field label="Notes" value={row.notes ?? "—"} />
            <Field label="Submitted" value={new Date(row.created_at).toLocaleString("en-GB")} />
          </Section>

          <Section title="Carrier investigation (Twilio Lookup)">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {row.twilio_status ? (
                  <TwilioBadge status={row.twilio_status} />
                ) : (
                  <span className="text-xs text-muted-foreground">Not checked</span>
                )}
                <Button size="sm" variant="outline" disabled={checking} onClick={onTwilio}>
                  {checking ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : row.twilio_status ? (
                    "Re-run"
                  ) : (
                    "Run Twilio check"
                  )}
                </Button>
              </div>
              {row.twilio_checked_at && (
                <div className="text-[11px] text-muted-foreground">
                  Checked {new Date(row.twilio_checked_at).toLocaleString("en-GB")}
                </div>
              )}
              <TwilioRecommendation status={row.twilio_status} />
              <p className="text-[11px] text-muted-foreground">
                Twilio is an investigation aid only. Admins retain the final decision.
              </p>
            </div>
          </Section>

          {row.status === "pending" ? (
            <Section title="Resolution">
              <p className="text-xs text-muted-foreground">
                Approve to refund the professional's credits, or reject with a written reason.
                Both actions notify the professional by email and in-app.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <Button
                  onClick={() => onResolve("approve", note)}
                  disabled={resolving}
                  className="min-h-[44px]"
                >
                  {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve refund"}
                </Button>
                <RejectDisputeDialog
                  disabled={resolving}
                  onConfirm={(reason) => {
                    setNote(reason);
                    onResolve("reject", reason);
                  }}
                />
              </div>
            </Section>
          ) : (
            <Section title="Resolution">
              <div className="flex items-center gap-2 text-sm">
                {row.status === "approved" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-600" />
                )}
                <StatusBadge status={row.status} />
                {row.resolved_at && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.resolved_at).toLocaleString("en-GB")}
                  </span>
                )}
              </div>
              {row.credits_refunded_amount != null && (
                <div className="text-xs text-emerald-700 mt-1">
                  +{row.credits_refunded_amount} coins refunded
                </div>
              )}
              {row.resolution_note && (
                <div className="mt-2 rounded border border-muted bg-muted/30 p-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    {row.status === "rejected" ? "Reason for rejection" : "Admin note"}
                  </div>
                  <p className="text-xs whitespace-pre-wrap">{row.resolution_note}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <RetryEmailButton
                  reportId={row.id}
                  lastStatus={row.last_email_status}
                  onRetried={refreshDiagnostics}
                />
                {row.last_email_status && (
                  <span className="text-[11px] text-muted-foreground">
                    Last email: {row.last_email_status}
                    {row.last_email_at
                      ? ` · ${new Date(row.last_email_at).toLocaleString("en-GB")}`
                      : ""}
                  </span>
                )}
              </div>
            </Section>
          )}


          <Section title="Resolution diagnostics">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Live status trace from the dispute row, pro account, notification row and email queue.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={refreshDiagnostics} className="h-8 text-xs">
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>
              {debugError ? (
                <div className="text-xs text-rose-700">{debugError}</div>
              ) : debug === null ? (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading diagnostics…
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Field label="Current dispute status" value={debug.current_dispute_status ?? "—"} />
                  <Field label="Current outcome" value={debug.current_outcome ?? "—"} />
                  <Field label="Professional user ID" value={debug.professional_user_id ?? "—"} mono />
                  <Field label="Professional email" value={debug.professional_email ?? "—"} />
                  <Field label="Email queue status" value={debug.email_queue_status} />
                  <Field label="Email message ID" value={debug.email_queue_message_id ?? "—"} mono />
                  <Field label="PGMQ message" value={debug.email_queue_pgmq_msg_id != null ? `#${debug.email_queue_pgmq_msg_id} · reads ${debug.email_queue_read_count ?? 0}` : "—"} />
                  <Field label="Last email error" value={debug.last_email_error ?? "—"} />
                  <Field label="Notification created" value={debug.notification_created ? "Yes" : "No"} />
                  <Field label="Notification user ID" value={debug.notification_user_id ?? "—"} mono />
                  <Field label="Last updated" value={debug.last_updated_timestamp ? new Date(debug.last_updated_timestamp).toLocaleString("en-GB") : "—"} />
                </div>
              )}
            </div>
          </Section>

          <Section title="Audit trail">
            {events === null ? (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </div>
            ) : events.length === 0 ? (
              <div className="text-xs text-muted-foreground">No events recorded.</div>
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id} className="text-xs border-l-2 border-muted pl-2">
                    <div className="font-medium">{formatAction(e.action)}</div>
                    <div className="text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("en-GB")}
                    </div>
                    {e.metadata && Object.keys(e.metadata).length > 0 && (
                      <pre className="mt-1 text-[10px] bg-muted/40 rounded p-1 overflow-x-auto">
                        {JSON.stringify(e.metadata)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className={`col-span-2 ${mono ? "font-mono text-[11px]" : ""} break-all`}>{value}</div>
    </div>
  );
}

function formatAction(a: string) {
  return a
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function RetryEmailButton({
  reportId,
  lastStatus,
  onRetried,
}: {
  reportId: string;
  lastStatus: "delivered" | "pending" | "failed" | null;
  onRetried: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const label =
    lastStatus === "delivered"
      ? "Resend outcome email"
      : lastStatus === "pending"
      ? "Resend (still pending)"
      : lastStatus === "failed"
      ? "Retry outcome email"
      : "Send outcome email";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await adminRetryDisputeEmail({ data: { report_id: reportId } });
          if (res?.queued) {
            toast.success("Outcome email re-queued");
          } else {
            toast.error(`Could not queue email${res?.reason ? `: ${res.reason}` : ""}`);
          }
          onRetried();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Retry failed");
        } finally {
          setBusy(false);
        }
      }}
      className="min-h-[36px]"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
      {label}
    </Button>
  );
}


function RejectDisputeDialog({
  disabled,
  onConfirm,
}: {
  disabled?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0 && !disabled;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setReason("");
      }}
    >
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="min-h-[44px]"
      >
        Reject dispute
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject dispute</DialogTitle>
          <DialogDescription>
            The professional will be notified by email and in-app with the reason below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-reason">
            Reason for rejection <span className="text-rose-600">*</span>
          </Label>
          <Textarea
            id="reject-reason"
            placeholder="Explain why this dispute is being rejected…"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            rows={5}
            autoFocus
          />
          <div className="text-[11px] text-muted-foreground text-right">
            {trimmed.length}/500
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              setOpen(false);
              onConfirm(trimmed);
            }}
          >
            Reject dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
