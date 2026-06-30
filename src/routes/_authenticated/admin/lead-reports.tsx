import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  adminListLeadReports, adminGetLeadReports, adminResolveLeadReport,
  type AdminLeadReportSummary, type AdminLeadReportDetail,
} from "@/lib/lead-reports.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/lead-reports")({
  head: () => ({ meta: [{ title: "Project quality reports — Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminLeadReportsPage,
});

function AdminLeadReportsPage() {
  const [tab, setTab] = useState<"pending" | "resolved" | "all">("pending");
  const [rows, setRows] = useState<AdminLeadReportSummary[] | null>(null);
  const [openJob, setOpenJob] = useState<AdminLeadReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setRows(null);
    setError(null);
    try {
      const data = await adminListLeadReports({
        data: { status: tab === "all" ? undefined : tab },
      });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  return (
    <AdminShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Project quality reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pros report invalid client phone numbers here. Approving refunds the pro&apos;s credits and
            marks the project invalid.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        {error && <div className="p-3 rounded border border-destructive/30 bg-destructive/5 text-sm">{error}</div>}
        {rows === null && !error && <div className="text-sm text-muted-foreground">Loading…</div>}
        {rows && rows.length === 0 && <div className="text-sm text-muted-foreground p-6 border rounded">No reports.</div>}

        {rows && rows.length > 0 && (
          <div className="border rounded-xl overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Reports</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>First</TableHead>
                  <TableHead>Last</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.job_id}>
                    <TableCell className="font-medium max-w-xs truncate">{r.job_title}</TableCell>
                    <TableCell className="text-xs">{r.customer_name}</TableCell>
                    <TableCell className="text-xs">
                      {r.report_count}
                      {r.pending_count > 0 && <span className="text-amber-700 ml-1">({r.pending_count} pending)</span>}
                    </TableCell>
                    <TableCell>
                      {r.quality_status === "invalid"
                        ? <Badge variant="destructive">Invalid</Badge>
                        : r.quality_status === "under_review"
                        ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Under review</Badge>
                        : <Badge variant="secondary">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">{new Date(r.first_report_at).toLocaleDateString("en-GB")}</TableCell>
                    <TableCell className="text-xs">{new Date(r.last_report_at).toLocaleDateString("en-GB")}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpenJob(r)}>View reports</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {openJob && (
        <ReportsDialog
          job={openJob}
          onClose={() => setOpenJob(null)}
          onChanged={() => { void load(); }}
        />
      )}
    </AdminShell>
  );
}

function ReportsDialog({ job, onClose, onChanged }: {
  job: AdminLeadReportSummary;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reports, setReports] = useState<AdminLeadReportDetail[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setReports(null);
    try {
      const data = await adminGetLeadReports({ data: { job_id: job.job_id } });
      setReports(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [job.job_id]);

  async function resolve(id: string, decision: "approve" | "reject") {
    setBusy(id + decision);
    try {
      await adminResolveLeadReport({ data: { report_id: id, decision, note } });
      toast.success(decision === "approve" ? "Refunded and marked invalid" : "Report rejected");
      setNote("");
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">{job.job_title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {reports === null && <div className="text-sm text-muted-foreground">Loading…</div>}
          {reports && reports.length === 0 && <div className="text-sm">No reports.</div>}
          {reports && reports.length > 0 && (
            <>
              <div className="space-y-3">
                {reports.map((r) => (
                  <div key={r.id} className="border rounded-lg p-3 text-sm space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{r.business_name ?? "(no business name)"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.reason === "disconnected" ? "Disconnected" : "Wrong number"} ·{" "}
                          {[r.attempted_call && "called", r.attempted_sms && "SMS"].filter(Boolean).join(" / ")} ·{" "}
                          {new Date(r.created_at).toLocaleString("en-GB")}
                        </div>
                      </div>
                      <Badge
                        className={
                          r.status === "approved" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                          : r.status === "rejected" ? "" : "bg-amber-100 text-amber-800 hover:bg-amber-100"
                        }
                        variant={r.status === "rejected" ? "secondary" : "default"}
                      >
                        {r.status}
                      </Badge>
                    </div>
                    {r.notes && <p className="text-xs text-muted-foreground italic">"{r.notes}"</p>}
                    {r.status === "approved" && r.credits_refunded_amount != null && (
                      <p className="text-xs text-emerald-700">+{r.credits_refunded_amount} coins refunded</p>
                    )}
                    {r.resolution_note && (
                      <p className="text-xs text-muted-foreground">Admin note: {r.resolution_note}</p>
                    )}
                    {r.status === "pending" && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={() => resolve(r.id, "approve")} disabled={!!busy}>
                          {busy === r.id + "approve" ? "Refunding…" : "Approve & refund"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => resolve(r.id, "reject")} disabled={!!busy}>
                          {busy === r.id + "reject" ? "Rejecting…" : "Reject"}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium">Admin note (optional, applied to next action)</label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
