import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listBankTransferRequests,
  approveBankTransferRequest,
  rejectBankTransferRequest,
  requestMoreInfoForBankTransfer,
  getBankTransferReceiptUrl,
} from "@/lib/bank-transfers.functions";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, FileText, Loader2, MessageSquare, RefreshCw, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/bank-transfers")({
  component: BankTransfersPage,
});

type Row = {
  id: string;
  user_id: string;
  professional_id: string;
  country_code: string;
  country: string | null;
  package_id: string;
  credits: number;
  amount_minor: number;
  currency: string;
  bank_name: string;
  transfer_reference: string;
  sender_account_name: string;
  payment_date: string;
  receipt_path: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected" | "more_info_requested";
  rejection_reason: string | null;
  admin_message: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  approved_at: string | null;
  credits_granted: number | null;
  email: string | null;
  professional_name: string | null;
};

const STATUS_BADGE: Record<Row["status"], { label: string; cls: string }> = {
  pending: { label: "Pending Review", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-900 border-rose-300" },
  more_info_requested: { label: "More Info Requested", cls: "bg-sky-100 text-sky-900 border-sky-300" },
};

function fmtNaira(minor: number) {
  return `₦${(minor / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function BankTransfersPage() {
  const [status, setStatus] = useState<"all" | Row["status"]>("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Dialog state
  const [rejectFor, setRejectFor] = useState<Row | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [infoFor, setInfoFor] = useState<Row | null>(null);
  const [infoMessage, setInfoMessage] = useState("");

  async function refresh() {
    setLoading(true);
    const res = await listBankTransferRequests({ data: { status } });
    setLoading(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      setRows([]);
      return;
    }
    setRows((res.items as Row[]) ?? []);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function openReceipt(row: Row) {
    if (!row.receipt_path) return;
    const res = await getBankTransferReceiptUrl({ data: { id: row.id } });
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function approve(row: Row) {
    if (!confirm(`Approve ${fmtNaira(row.amount_minor)} → credit ${row.credits} coins to ${row.professional_name ?? row.email}?`)) return;
    setBusyId(row.id);
    const res = await approveBankTransferRequest({ data: { id: row.id } });
    setBusyId(null);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Approved and coins credited.");
    refresh();
  }

  async function submitReject() {
    if (!rejectFor) return;
    if (!rejectReason.trim() || rejectReason.trim().length < 3) {
      toast.error("Please enter a reason.");
      return;
    }
    setBusyId(rejectFor.id);
    const res = await rejectBankTransferRequest({
      data: { id: rejectFor.id, reason: rejectReason.trim() },
    });
    setBusyId(null);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Rejected.");
    setRejectFor(null);
    setRejectReason("");
    refresh();
  }

  async function submitMoreInfo() {
    if (!infoFor) return;
    if (!infoMessage.trim() || infoMessage.trim().length < 3) {
      toast.error("Please enter a message for the professional.");
      return;
    }
    setBusyId(infoFor.id);
    const res = await requestMoreInfoForBankTransfer({
      data: { id: infoFor.id, message: infoMessage.trim() },
    });
    setBusyId(null);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Sent request for more info.");
    setInfoFor(null);
    setInfoMessage("");
    refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>Bank Transfer Reviews</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Nigeria-only. Verify deposits and credit coins to professionals.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending Review</SelectItem>
                <SelectItem value="more_info_requested">More Info Requested</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Professional</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Bank / Sender</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">
                      No bank transfer requests in this view.
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.map((r) => {
                  const badge = STATUS_BADGE[r.status];
                  const reviewable = r.status === "pending" || r.status === "more_info_requested";
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.professional_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.email ?? "—"}</div>
                      </TableCell>
                      <TableCell>
                        <div>{r.package_id}</div>
                        <div className="text-xs text-muted-foreground">{r.credits} coins</div>
                      </TableCell>
                      <TableCell className="font-medium">{fmtNaira(r.amount_minor)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.transfer_reference}</TableCell>
                      <TableCell>
                        <div>{r.bank_name}</div>
                        <div className="text-xs text-muted-foreground">{r.sender_account_name}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{new Date(r.created_at).toLocaleDateString("en-GB")}</div>
                        <div className="text-muted-foreground">Paid {r.payment_date}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={badge.cls}>{badge.label}</Badge>
                        {r.status === "rejected" && r.rejection_reason && (
                          <div className="text-xs text-muted-foreground mt-1 max-w-[200px]">{r.rejection_reason}</div>
                        )}
                        {r.status === "more_info_requested" && r.admin_message && (
                          <div className="text-xs text-muted-foreground mt-1 max-w-[200px]">{r.admin_message}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-y-1">
                        {r.receipt_path && (
                          <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => openReceipt(r)}>
                            <FileText className="h-3.5 w-3.5 mr-1.5" /> Receipt
                          </Button>
                        )}
                        {reviewable && (
                          <>
                            <Button
                              size="sm"
                              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={busyId === r.id}
                              onClick={() => approve(r)}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              disabled={busyId === r.id}
                              onClick={() => { setInfoFor(r); setInfoMessage(""); }}
                            >
                              <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Request info
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-rose-700 hover:text-rose-800"
                              disabled={busyId === r.id}
                              onClick={() => { setRejectFor(r); setRejectReason(""); }}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject bank transfer</DialogTitle>
            <DialogDescription>
              The professional will be emailed your reason. They can resubmit with corrected details.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Transfer reference doesn't match any deposit in our account."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={submitReject}
              disabled={busyId === rejectFor?.id}
            >
              Reject and email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* More info dialog */}
      <Dialog open={!!infoFor} onOpenChange={(o) => !o && setInfoFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request more information</DialogTitle>
            <DialogDescription>
              Tell the professional what you need. They'll receive this by email and in-app.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={infoMessage}
            onChange={(e) => setInfoMessage(e.target.value)}
            placeholder="e.g. Please reply with a screenshot of your bank app confirmation."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setInfoFor(null)}>Cancel</Button>
            <Button onClick={submitMoreInfo} disabled={busyId === infoFor?.id}>
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
