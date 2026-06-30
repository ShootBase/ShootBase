import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProShell } from "@/components/site/ProShell";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Download, Mail, Pencil, Loader2 } from "lucide-react";
import {
  getInvoice,
  getInvoicePdfUrl,
  getProBranding,
  sendInvoiceEmail,
  setInvoiceStatus,
  type Invoice,
} from "@/lib/invoices.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/create-invoice/$id")({
  head: () => ({
    meta: [
      { title: "Invoice — Shootbase Pro" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvoiceDetailPage,
});

function gbp(p: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((p || 0) / 100);
}

function StatusPill({ status, color }: { status: Invoice["status"]; color?: string }) {
  if (color) {
    return (
      <span
        className="inline-block text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border bg-white"
        style={{ color, borderColor: color }}
      >
        {status}
      </span>
    );
  }
  const map = {
    draft: "bg-ink/10 text-ink/70",
    sent: "bg-blue-100 text-blue-800",
    paid: "bg-emerald-100 text-emerald-800",
  } as const;
  return (
    <span className={`inline-block text-[10px] uppercase tracking-widest px-2 py-1 rounded ${map[status]}`}>
      {status}
    </span>
  );
}

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [proBranding, setProBranding] = useState<{ business_name: string | null; logo_url: string | null; brand_color: string | null }>({
    business_name: null,
    logo_url: null,
    brand_color: null,
  });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  async function refresh() {
    const [data, branding] = await Promise.all([
      getInvoice({ data: { id } }),
      getProBranding().catch(() => ({ business_name: null, logo_url: null, brand_color: null })),
    ]);
    setInvoice(data);
    setProBranding(branding);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, [id]);

  async function handleDownload() {
    if (!invoice) return;
    setDownloading(true);
    try {
      const { url, filename } = await getInvoicePdfUrl({ data: { id: invoice.id } });
      if (!url) throw new Error("Could not generate PDF");
      const { downloadFromUrl } = await import("@/lib/download-blob");
      await downloadFromUrl(url, filename);
    } catch (e: any) {
      toast.error(e?.message || "Could not download PDF");
    } finally {
      setDownloading(false);
    }
  }

  function requestSend() {
    if (!invoice) return;
    if (!invoice.client_email) {
      toast.error("Add a client email to send this invoice.");
      return;
    }
    setConfirmSendOpen(true);
  }

  async function handleSend() {
    if (!invoice) return;
    setConfirmSendOpen(false);
    setSending(true);
    try {
      await sendInvoiceEmail({ data: { id: invoice.id } });
      toast.success(`Invoice emailed to ${invoice.client_email}`);
      void refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not send invoice");
    } finally {
      setSending(false);
    }
  }

  async function handleMarkPaid() {
    if (!invoice) return;
    await setInvoiceStatus({ data: { id: invoice.id, status: "paid" } });
    toast.success("Marked as paid");
    void refresh();
  }

  if (loading) {
    return (
      <ProShell>
        <div className="max-w-4xl mx-auto px-6 py-10 text-sm text-ink/50">Loading…</div>
      </ProShell>
    );
  }

  if (!invoice) {
    return (
      <ProShell>
        <div className="max-w-4xl mx-auto px-6 py-10">
          <p className="text-sm text-ink/60 mb-4">Invoice not found.</p>
          <Link to="/create-invoice" className="text-sm underline">Back to invoices</Link>
        </div>
      </ProShell>
    );
  }

  const subtotal = invoice.subtotal_pence;
  const businessName = invoice.business_name?.trim() || proBranding.business_name || "Your business";
  const logoUrl = invoice.logo_url?.trim() || proBranding.logo_url || "";
  const brandColor = invoice.brand_color?.trim() || proBranding.brand_color || "#C5A059";
  const isBranded = Boolean(
    invoice.business_name?.trim() ||
      invoice.logo_url?.trim() ||
      invoice.brand_color?.trim() ||
      proBranding.business_name ||
      proBranding.logo_url ||
      proBranding.brand_color,
  );

  return (
    <ProShell>
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link
          to="/create-invoice"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-ink/60 hover:text-ink mb-6"
        >
          <ArrowLeft className="h-3 w-3" /> Back to invoices
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-ink/50 mb-1">Invoice</p>
            <h1 className="font-display text-4xl flex items-center gap-3">
              {invoice.invoice_number}
              <StatusPill status={invoice.status} color={brandColor} />
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/create-invoice-editor/$id", params: { id: invoice.id } })}
            >
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="outline" onClick={handleDownload} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>
            <Button
              onClick={requestSend}
              disabled={sending || !invoice.client_email}
              className="text-white hover:opacity-90"
              style={{ backgroundColor: brandColor }}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send PDF to client
            </Button>
          </div>
        </div>

        <div className="rounded-xl bg-white shadow-xl border border-ink/10 overflow-hidden">
          {/* Brand accent band */}
          <div className="h-2" style={{ backgroundColor: brandColor }} />

          <div className="p-8 md:p-10">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-start gap-6 mb-8">
              <div className="min-w-0">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    className="max-h-16 max-w-[220px] object-contain mb-3"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : null}
                <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-1">From</p>
                <p className="font-semibold text-lg">{businessName}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-display text-3xl tracking-tight">INVOICE</p>
                <p className="font-mono text-xs text-ink/60 mt-1">{invoice.invoice_number}</p>
              </div>
            </div>

            {/* Meta card */}
            <div
              className="rounded-lg p-5 mb-8 border-l-4"
              style={{ borderLeftColor: brandColor, backgroundColor: "#f8f8f9" }}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Meta label="Issue date" value={invoice.invoice_date} />
                <Meta label="Due date" value={invoice.due_date || "—"} />
                <Meta label="Status" value={invoice.status.toUpperCase()} />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-1">Amount due</p>
                  <p className="font-display text-xl font-semibold" style={{ color: brandColor }}>
                    {gbp(invoice.total_pence)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-1">Bill to</p>
              <p className="font-medium">{invoice.client_name}</p>
              {invoice.client_email && <p className="text-sm text-ink/70">{invoice.client_email}</p>}
              {invoice.project_description && (
                <p className="text-sm text-ink/60 mt-2">{invoice.project_description}</p>
              )}
            </div>

            {/* Line items */}
            <table className="w-full text-sm mb-6">
              <thead className="text-[10px] uppercase tracking-widest text-ink/50 border-b border-ink/10">
                <tr>
                  <th className="text-left py-2">Description</th>
                  <th className="text-right py-2 w-20">Qty</th>
                  <th className="text-right py-2 w-28">Rate</th>
                  <th className="text-right py-2 w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.line_items ?? []).map((item) => (
                  <tr key={item.id} className="border-b border-ink/5">
                    <td className="py-3">{item.description || "—"}</td>
                    <td className="py-3 text-right">{item.quantity}</td>
                    <td className="py-3 text-right font-mono">{gbp(item.rate_pence)}</td>
                    <td className="py-3 text-right font-mono">
                      {gbp(Math.round(item.quantity * item.rate_pence))}
                    </td>
                  </tr>
                ))}
                {(!invoice.line_items || invoice.line_items.length === 0) && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-ink/50 text-xs">
                      No line items
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-2 text-sm">
                <div className="flex justify-between text-ink/70">
                  <span>Subtotal</span>
                  <span className="font-mono">{gbp(subtotal)}</span>
                </div>
                {invoice.tax_enabled && (
                  <div className="flex justify-between text-ink/70">
                    <span>Tax ({invoice.tax_rate}%)</span>
                    <span className="font-mono">{gbp(invoice.tax_pence)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg pt-2 border-t border-ink/10">
                  <span>Total</span>
                  <span className="font-mono" style={{ color: brandColor }}>{gbp(invoice.total_pence)}</span>
                </div>
              </div>
            </div>

            {invoice.notes && (
              <div className="mt-8 pt-6 border-t border-ink/10">
                <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-2">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}

            <p className="mt-10 text-center text-[10px] text-ink/40">
              {isBranded ? "Invoice powered by Shootbase" : "Sent via Shootbase"}
            </p>
          </div>
        </div>

        {invoice.status !== "paid" && (
          <div className="mt-6 flex justify-end">
            <Button variant="outline" onClick={handleMarkPaid}>
              Mark as paid
            </Button>
          </div>
        )}
      </div>



      <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send invoice {invoice.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              We'll email <strong>{invoice.client_email}</strong> a branded PDF of this invoice
              from <strong>{businessName}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend}>Send PDF</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProShell>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-1">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
