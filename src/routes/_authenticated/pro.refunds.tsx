import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProShell } from "@/components/site/ProShell";
import { myLeadReports, type MyLeadReport } from "@/lib/lead-reports.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/pro/refunds")({
  head: () => ({ meta: [{ title: "Refund Requests — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: ProRefundsPage,
});

const REASON_LABELS: Record<string, string> = {
  disconnected: "Number is disconnected / out of service",
  wrong_number: "Wrong number (reached someone else)",
};

function StatusBadge({ status }: { status: MyLeadReport["status"] }) {
  if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Approved</Badge>;
  if (status === "rejected") return <Badge variant="secondary">Rejected</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>;
}

function CommunicationStatusBadge({ status }: { status: MyLeadReport["communication_history"][number]["status"] }) {
  if (status === "delivered") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">✓ Delivered</Badge>;
  if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">⏳ Pending</Badge>;
  return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">❌ Failed</Badge>;
}

function ProRefundsPage() {
  const [rows, setRows] = useState<MyLeadReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<MyLeadReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      myLeadReports()
        .then((r) => { if (!cancelled) setRows(r); })
        .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); });
    };
    load();

    // Realtime refresh: when our dispute rows update (admin approves/rejects)
    // or a new in-app notification lands, re-fetch immediately so the user
    // sees Approved/Rejected without a manual refresh.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;
      channel = supabase
        .channel(`pro-refunds-${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "lead_reports" },
          () => load(),
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          () => load(),
        )
        .subscribe();
    })();

    // Refresh when the tab becomes visible again (covers users who left
    // the dashboard open in a background tab).
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);


  return (
    <ProShell>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Refund Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track the status of your invalid project reports and credit refunds.
          </p>
        </header>

        {error && <div className="p-4 rounded border border-destructive/30 bg-destructive/5 text-sm">{error}</div>}

        {rows === null && !error && <div className="text-sm text-muted-foreground">Loading…</div>}

        {rows && rows.length === 0 && (
          <div className="border rounded-xl p-10 text-center bg-card space-y-3">
            <h2 className="font-semibold text-lg">No refund requests yet</h2>
            <p className="text-sm text-muted-foreground">You have not submitted any invalid project reports.</p>
            <div>
              <Link to="/pro/leads" className="inline-block">
                <Button>View Unlocked Projects</Button>
              </Link>
            </div>
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="border rounded-xl overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Project ID</TableHead>
                  <TableHead>Date Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead>Resolution Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.job_title}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{r.job_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString("en-GB")}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right text-xs">
                      {r.credit_refunded ? `+${r.credits_refunded_amount ?? 0}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.resolved_at ? new Date(r.resolved_at).toLocaleDateString("en-GB") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link to="/pro/leads">
                          <Button size="sm" variant="outline">View Project</Button>
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>Details</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Report Details</DialogTitle>
            <DialogDescription>{detail?.job_title}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Reason</p>
                <p>{REASON_LABELS[detail.reason] ?? detail.reason}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                <StatusBadge status={detail.status} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Submitted</p>
                <p>{new Date(detail.created_at).toLocaleString("en-GB")}</p>
              </div>
              {detail.resolved_at && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Resolved</p>
                  <p>{new Date(detail.resolved_at).toLocaleString("en-GB")}</p>
                </div>
              )}
              {detail.credit_refunded && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Credits Refunded</p>
                  <p className="text-emerald-700 font-medium">+{detail.credits_refunded_amount ?? 0} coins</p>
                </div>
              )}
              <div className="border-t pt-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Communication History</p>
                {detail.communication_history.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No email communications recorded yet.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.communication_history.map((event) => (
                          <TableRow key={`${event.type}-${event.date}`}>
                            <TableCell className="text-xs whitespace-nowrap">{new Date(event.date).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                            <TableCell className="text-xs">{event.label}</TableCell>
                            <TableCell><CommunicationStatusBadge status={event.status} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ProShell>
  );
}
