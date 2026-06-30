import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProShell } from "@/components/site/ProShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Lock, Plus, FileText, Search, Crown, Sparkles } from "lucide-react";
import { getInvoiceAccess, listInvoices, setInvoiceStatus, deleteInvoice, sendInvoiceEmail, getInvoicePdfUrl, type Invoice } from "@/lib/invoices.functions";
import { Mail, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/create-invoice")({
  head: () => ({
    meta: [
      { title: "Invoices — Shootbase Pro" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CreateInvoicePage,
});

type Filter = "all" | "draft" | "sent" | "paid";

const SAMPLE: Invoice[] = [
  {
    id: "sample-1", user_id: "", invoice_number: "INV-0001", status: "paid",
    client_name: "Aurora Bridal", client_email: "hello@aurora.example",
    project_description: "Wedding photography — full day", invoice_date: new Date().toISOString().slice(0, 10),
    due_date: null, line_items: [], tax_enabled: false, tax_rate: 0,
    subtotal_pence: 180000, tax_pence: 0, total_pence: 180000,
    notes: null, business_name: null, logo_url: null, brand_color: null,
    bank_details: null, payment_links: [], show_bank_details: false, show_payment_links: false, sent_at: null, paid_at: new Date().toISOString(), created_at: "", updated_at: "",
  },
  {
    id: "sample-2", user_id: "", invoice_number: "INV-0002", status: "sent",
    client_name: "Northern Lights Studio", client_email: null,
    project_description: "Brand video — 60s edit", invoice_date: new Date().toISOString().slice(0, 10),
    due_date: null, line_items: [], tax_enabled: true, tax_rate: 20,
    subtotal_pence: 95000, tax_pence: 19000, total_pence: 114000,
    notes: null, business_name: null, logo_url: null, brand_color: null,
    bank_details: null, payment_links: [], show_bank_details: false, show_payment_links: false, sent_at: new Date().toISOString(), paid_at: null, created_at: "", updated_at: "",
  },
  {
    id: "sample-3", user_id: "", invoice_number: "INV-0003", status: "draft",
    client_name: "Marlowe & Co.", client_email: null,
    project_description: "Headshots — team of 8", invoice_date: new Date().toISOString().slice(0, 10),
    due_date: null, line_items: [], tax_enabled: false, tax_rate: 0,
    subtotal_pence: 64000, tax_pence: 0, total_pence: 64000,
    notes: null, business_name: null, logo_url: null, brand_color: null,
    bank_details: null, payment_links: [], show_bank_details: false, show_payment_links: false, sent_at: null, paid_at: null, created_at: "", updated_at: "",
  },
];

function formatGBP(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function StatusPill({ status }: { status: Invoice["status"] }) {
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

function CreateInvoicePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sendTarget, setSendTarget] = useState<Invoice | null>(null);
  const [sending, setSending] = useState(false);

  async function refresh() {
    const access = await getInvoiceAccess();
    setIsPro(access.isPro);
    if (access.isPro) {
      const list = await listInvoices();
      setInvoices(list);
    }
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((i) => {
      if (filter !== "all" && i.status !== filter) return false;
      if (!q) return true;
      return (
        i.invoice_number.toLowerCase().includes(q) ||
        i.client_name.toLowerCase().includes(q)
      );
    });
  }, [invoices, filter, search]);

  const counts = useMemo(() => ({
    all: invoices.length,
    draft: invoices.filter((i) => i.status === "draft").length,
    sent: invoices.filter((i) => i.status === "sent").length,
    paid: invoices.filter((i) => i.status === "paid").length,
  }), [invoices]);

  async function handleMarkSent(id: string) {
    await setInvoiceStatus({ data: { id, status: "sent" } });
    toast.success("Marked as sent");
    void refresh();
  }
  async function handleMarkPaid(id: string) {
    await setInvoiceStatus({ data: { id, status: "paid" } });
    toast.success("Marked as paid");
    void refresh();
  }
  async function handleDelete(id: string) {
    if (!confirm("Delete this invoice?")) return;
    await deleteInvoice({ data: { id } });
    toast.success("Invoice deleted");
    void refresh();
  }
  function handleSendEmail(inv: Invoice) {
    if (!inv.client_email) {
      toast.error("Add a client email on this invoice first.");
      return;
    }
    setSendTarget(inv);
  }
  async function confirmSend() {
    const inv = sendTarget;
    if (!inv) return;
    setSending(true);
    try {
      await sendInvoiceEmail({ data: { id: inv.id } });
      toast.success(`Invoice emailed to ${inv.client_email}`);
      setSendTarget(null);
      void refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not send invoice");
    } finally {
      setSending(false);
    }
  }
  async function handleDownload(inv: Invoice) {
    try {
      const { url, filename } = await getInvoicePdfUrl({ data: { id: inv.id } });
      if (!url) throw new Error("Could not generate PDF");
      const { downloadFromUrl } = await import("@/lib/download-blob");
      await downloadFromUrl(url, filename);
    } catch (e: any) {
      toast.error(e?.message || "Could not download PDF");
    }
  }

  return (
    <ProShell>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-ink/50 mb-1">Pro Tool</p>
            <h1 className="font-display text-4xl">Invoices</h1>
            <p className="text-sm text-ink/60 mt-1">Create and track professional invoices for your clients.</p>
          </div>
          {isPro && (
            <Button onClick={() => navigate({ to: "/create-invoice-editor/new" })} className="bg-ink text-paper hover:bg-gold">
              <Plus className="h-4 w-4" /> New invoice
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-ink/50">Loading…</p>
        ) : !isPro ? (
          <LockedView />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {(["all", "draft", "sent", "paid"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-left border p-4 rounded transition-colors ${
                    filter === f ? "border-gold bg-gold/5" : "border-ink/10 hover:border-ink/30"
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-widest text-ink/50">{f === "all" ? "Total" : f}</p>
                  <p className="font-display text-3xl mt-1">{counts[f]}</p>
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40" />
                <Input
                  className="pl-9"
                  placeholder="Search by client name or invoice number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="border border-dashed border-ink/15 rounded p-10 text-center">
                <FileText className="h-8 w-8 mx-auto text-ink/30 mb-3" />
                <p className="font-display text-xl mb-1">No invoices yet</p>
                <p className="text-sm text-ink/60 mb-4">Create your first invoice to get started.</p>
                <Button onClick={() => navigate({ to: "/create-invoice-editor/new" })} className="bg-ink text-paper hover:bg-gold">
                  <Plus className="h-4 w-4" /> New invoice
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop table (lg+) */}
                <div className="hidden lg:block border border-ink/10 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-ink/[0.02] text-[10px] uppercase tracking-widest text-ink/60">
                      <tr>
                        <th className="text-left p-3">Number</th>
                        <th className="text-left p-3">Client</th>
                        <th className="text-left p-3 hidden xl:table-cell">Date</th>
                        <th className="text-right p-3">Total</th>
                        <th className="text-left p-3">Status</th>
                        <th className="text-right p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((inv) => (
                        <tr
                          key={inv.id}
                          className="border-t border-ink/5 hover:bg-ink/[0.02] cursor-pointer"
                          onClick={() => navigate({ to: "/create-invoice/$id", params: { id: inv.id } })}
                        >
                          <td className="p-3 font-mono text-xs">{inv.invoice_number}</td>
                          <td className="p-3">
                            <p className="font-medium">{inv.client_name}</p>
                            {inv.project_description && (
                              <p className="text-xs text-ink/50 truncate max-w-[28ch]">{inv.project_description}</p>
                            )}
                          </td>
                          <td className="p-3 hidden xl:table-cell text-ink/70">{inv.invoice_date}</td>
                          <td className="p-3 text-right font-mono">{formatGBP(inv.total_pence)}</td>
                          <td className="p-3"><StatusPill status={inv.status} /></td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex flex-wrap justify-end gap-2">
                              <Link
                                to="/create-invoice-editor/$id"
                                params={{ id: inv.id }}
                                className="text-xs px-3 py-1.5 border border-ink/20 rounded hover:border-gold"
                              >
                                Edit
                              </Link>
                              <button
                                onClick={() => handleDownload(inv)}
                                title="Download PDF"
                                className="text-xs px-3 py-1.5 border border-ink/20 rounded hover:border-gold inline-flex items-center gap-1"
                              >
                                <Download className="h-3 w-3" /> Download
                              </button>
                              <button
                                onClick={() => handleSendEmail(inv)}
                                disabled={!inv.client_email}
                                title={inv.client_email ? `Email to ${inv.client_email}` : "Add a client email to enable sending"}
                                className="text-xs px-3 py-1.5 bg-ink text-paper rounded hover:bg-gold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                              >
                                <Mail className="h-3 w-3" /> Send to client
                              </button>
                              {inv.status === "draft" && (
                                <button
                                  onClick={() => handleMarkSent(inv.id)}
                                  className="text-xs px-3 py-1.5 border border-ink/20 rounded hover:border-gold"
                                >
                                  Mark sent
                                </button>
                              )}
                              {inv.status !== "paid" && (
                                <button
                                  onClick={() => handleMarkPaid(inv.id)}
                                  className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                >
                                  Mark paid
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(inv.id)}
                                className="text-xs px-3 py-1.5 text-red-600 hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile / tablet stacked cards */}
                <div className="lg:hidden space-y-3">
                  {filtered.map((inv) => (
                    <div
                      key={inv.id}
                      className="border border-ink/10 rounded-lg bg-paper p-4"
                    >
                      <div
                        className="cursor-pointer"
                        onClick={() => navigate({ to: "/create-invoice/$id", params: { id: inv.id } })}
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] text-ink/50">{inv.invoice_number}</p>
                            <p className="font-medium truncate mt-0.5">{inv.client_name}</p>
                            {inv.project_description && (
                              <p className="text-xs text-ink/50 truncate">{inv.project_description}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-mono text-base">{formatGBP(inv.total_pence)}</p>
                            <p className="text-[11px] text-ink/50 mt-0.5">{inv.invoice_date}</p>
                          </div>
                        </div>
                        <div className="mt-2"><StatusPill status={inv.status} /></div>
                      </div>

                      <div
                        className="mt-3 pt-3 border-t border-ink/10 grid grid-cols-2 sm:grid-cols-3 gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          to="/create-invoice-editor/$id"
                          params={{ id: inv.id }}
                          className="text-xs px-3 py-2 border border-ink/20 rounded hover:border-gold inline-flex items-center justify-center"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDownload(inv)}
                          className="text-xs px-3 py-2 border border-ink/20 rounded hover:border-gold inline-flex items-center justify-center gap-1"
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </button>
                        <button
                          onClick={() => handleSendEmail(inv)}
                          disabled={!inv.client_email}
                          title={inv.client_email ? `Email to ${inv.client_email}` : "Add a client email to enable sending"}
                          className="text-xs px-3 py-2 bg-ink text-paper rounded hover:bg-gold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1 col-span-2 sm:col-span-1"
                        >
                          <Mail className="h-3.5 w-3.5" /> Send to client
                        </button>
                        {inv.status === "draft" && (
                          <button
                            onClick={() => handleMarkSent(inv.id)}
                            className="text-xs px-3 py-2 border border-ink/20 rounded hover:border-gold"
                          >
                            Mark sent
                          </button>
                        )}
                        {inv.status !== "paid" && (
                          <button
                            onClick={() => handleMarkPaid(inv.id)}
                            className="text-xs px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                          >
                            Mark paid
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(inv.id)}
                          className="text-xs px-3 py-2 text-red-600 border border-red-200 rounded hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

          </>
        )}
      </div>

      <AlertDialog open={!!sendTarget} onOpenChange={(o) => !o && setSendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send invoice {sendTarget?.invoice_number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              We'll email <strong>{sendTarget?.client_email}</strong> a branded PDF of this
              invoice from <strong>Shootbase</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSend} disabled={sending}>
              {sending ? "Sending…" : "Send PDF"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProShell>
  );
}

function LockedView() {
  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm opacity-60">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {(["Total", "Draft", "Sent", "Paid"] as const).map((label, i) => (
            <div key={label} className="border border-ink/10 p-4 rounded">
              <p className="text-[10px] uppercase tracking-widest text-ink/50">{label}</p>
              <p className="font-display text-3xl mt-1">{[12, 3, 4, 5][i]}</p>
            </div>
          ))}
        </div>
        <div className="border border-ink/10 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink/[0.02] text-[10px] uppercase tracking-widest text-ink/60">
              <tr>
                <th className="text-left p-3">Number</th>
                <th className="text-left p-3">Client</th>
                <th className="text-right p-3">Total</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE.map((inv) => (
                <tr key={inv.id} className="border-t border-ink/5">
                  <td className="p-3 font-mono text-xs">{inv.invoice_number}</td>
                  <td className="p-3">{inv.client_name}</td>
                  <td className="p-3 text-right font-mono">{formatGBP(inv.total_pence)}</td>
                  <td className="p-3"><StatusPill status={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-paper border border-gold/30 shadow-xl rounded-lg p-8 max-w-md text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gold/15 text-gold mb-4">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="font-display text-2xl mb-2">Subscribe to use Invoices</h2>
          <p className="text-sm text-ink/70 mb-5">
            This Pro feature is available with an active subscription. Subscribe to unlock Invoices and receive 30 coins monthly.
          </p>
          <ul className="text-left text-sm text-ink/80 space-y-2 mb-6">
            <li className="flex items-start gap-2"><Sparkles className="h-4 w-4 text-gold mt-0.5 shrink-0" /> 30 coins included every month with your subscription</li>

            <li className="flex items-start gap-2"><Sparkles className="h-4 w-4 text-gold mt-0.5 shrink-0" /> Unlimited invoice creation while subscribed</li>
            <li className="flex items-start gap-2"><Sparkles className="h-4 w-4 text-gold mt-0.5 shrink-0" /> Professional branded PDF invoices</li>
            <li className="flex items-start gap-2"><Sparkles className="h-4 w-4 text-gold mt-0.5 shrink-0" /> Track invoice status easily</li>
            <li className="flex items-start gap-2"><Sparkles className="h-4 w-4 text-gold mt-0.5 shrink-0" /> Improve professionalism and client trust</li>
          </ul>
          <div className="flex flex-col gap-2">
            <Link
              to="/pro/credits"
              className="inline-flex items-center justify-center gap-2 bg-ink text-paper px-5 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold rounded"
            >
              <Crown className="h-4 w-4" /> Upgrade to Pro
            </Link>
            <Link to="/pro/credits" className="text-xs uppercase tracking-widest text-ink/60 hover:text-ink">
              View Pro Plan
            </Link>
          </div>
          <Button disabled className="mt-4 w-full opacity-50" variant="outline">
            <Lock className="h-3 w-3" /> Invoices
          </Button>
        </div>
      </div>
    </div>
  );
}
