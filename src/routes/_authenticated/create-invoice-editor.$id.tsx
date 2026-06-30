import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProShell } from "@/components/site/ProShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, ArrowLeft, Eye } from "lucide-react";
import { getInvoice, saveInvoice, getProBranding, saveProBranding, type LineItem, type PaymentLink } from "@/lib/invoices.functions";
import { BusinessLogoUploader } from "@/components/pro/BusinessLogoUploader";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/create-invoice-editor/$id")({
  head: () => ({ meta: [{ title: "Invoice — Shootbase Pro" }, { name: "robots", content: "noindex" }] }),
  component: InvoiceEditor,
});

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatGBP(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type FormState = {
  client_name: string;
  client_email: string;
  project_description: string;
  invoice_date: string;
  due_date: string;
  line_items: LineItem[];
  tax_enabled: boolean;
  tax_rate: number;
  notes: string;
  business_name: string;
  logo_url: string;
  brand_color: string;
  bank_details: string;
  payment_links: PaymentLink[];
  show_bank_details: boolean;
  show_payment_links: boolean;
};

const EMPTY: FormState = {
  client_name: "",
  client_email: "",
  project_description: "",
  invoice_date: new Date().toISOString().slice(0, 10),
  due_date: addDays(14),
  line_items: [{ id: newId(), description: "", quantity: 1, rate_pence: 0 }],
  tax_enabled: false,
  tax_rate: 20,
  notes: "",
  business_name: "",
  logo_url: "",
  brand_color: "",
  bank_details: "",
  payment_links: [],
  show_bank_details: false,
  show_payment_links: false,
};

function InvoiceEditor() {
  const { id } = useParams({ from: "/_authenticated/create-invoice-editor/$id" });
  const navigate = useNavigate();
  const isNew = id === "new";
  const [form, setForm] = useState<FormState>(EMPTY);
  const [proDefaults, setProDefaults] = useState<{ business_name: string | null; logo_url: string | null; brand_color: string | null }>({
    business_name: null,
    logo_url: null,
    brand_color: null,
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);

  useEffect(() => {
    void getProBranding().then((b) => setProDefaults(b));
    if (isNew) return;
    void getInvoice({ data: { id } }).then((inv) => {
      if (!inv) {
        toast.error("Invoice not found");
        navigate({ to: "/create-invoice" });
        return;
      }
      setForm({
        client_name: inv.client_name,
        client_email: inv.client_email ?? "",
        project_description: inv.project_description ?? "",
        invoice_date: inv.invoice_date,
        due_date: inv.due_date ?? "",
        line_items: inv.line_items.length ? inv.line_items : EMPTY.line_items,
        tax_enabled: inv.tax_enabled,
        tax_rate: Number(inv.tax_rate),
        notes: inv.notes ?? "",
        business_name: inv.business_name ?? "",
        logo_url: inv.logo_url ?? "",
        brand_color: inv.brand_color ?? "",
        bank_details: inv.bank_details ?? "",
        payment_links: inv.payment_links ?? [],
        show_bank_details: inv.show_bank_details ?? false,
        show_payment_links: inv.show_payment_links ?? false,
      });
      setLoading(false);
    });
  }, [id, isNew, navigate]);

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setForm((f) => ({
      ...f,
      line_items: f.line_items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  }
  function addItem() {
    setForm((f) => ({ ...f, line_items: [...f.line_items, { id: newId(), description: "", quantity: 1, rate_pence: 0 }] }));
  }
  function removeItem(idx: number) {
    setForm((f) => ({ ...f, line_items: f.line_items.filter((_, i) => i !== idx) }));
  }

  const subtotal = form.line_items.reduce((s, it) => s + Math.round(it.quantity * it.rate_pence), 0);
  const tax = form.tax_enabled ? Math.round((subtotal * form.tax_rate) / 100) : 0;
  const total = subtotal + tax;

  // Effective branding for the live preview: invoice override → pro default → Shootbase fallback
  const effective = useMemo(() => ({
    business_name: form.business_name.trim() || proDefaults.business_name || "Shootbase",
    logo_url: form.logo_url.trim() || proDefaults.logo_url || "",
    brand_color: form.brand_color.trim() || proDefaults.brand_color || "#C5A059",
    isBranded: Boolean(form.business_name.trim() || form.logo_url.trim() || form.brand_color.trim() || proDefaults.business_name || proDefaults.logo_url || proDefaults.brand_color),
  }), [form.business_name, form.logo_url, form.brand_color, proDefaults]);

  async function handleSave() {
    if (!form.client_name.trim()) {
      toast.error("Client name is required");
      return;
    }
    setSaving(true);
    try {
      // Persist business name + brand colour to the Pro's saved branding so they
      // carry over to future invoices automatically.
      try {
        await saveProBranding({
          data: {
            business_name: form.business_name.trim() || proDefaults.business_name || null,
            brand_color: form.brand_color.trim() || proDefaults.brand_color || null,
          },
        });
      } catch {
        // non-fatal — invoice save proceeds
      }

      const saved = await saveInvoice({
        data: {
          id: isNew ? undefined : id,
          client_name: form.client_name.trim(),
          client_email: form.client_email.trim() || null,
          project_description: form.project_description.trim() || null,
          invoice_date: form.invoice_date,
          due_date: form.due_date || null,
          line_items: form.line_items,
          tax_enabled: form.tax_enabled,
          tax_rate: form.tax_rate,
          notes: form.notes.trim() || null,
          business_name: form.business_name.trim() || null,
          logo_url: form.logo_url.trim() || null,
          brand_color: form.brand_color.trim() || null,
          bank_details: form.bank_details.trim() || null,
          payment_links: form.payment_links
            .map((l) => ({ id: l.id, label: l.label.trim(), url: l.url.trim() }))
            .filter((l) => l.url.length > 0),
          show_bank_details: form.show_bank_details,
          show_payment_links: form.show_payment_links,
        },
      });
      toast.success(`Invoice ${saved.invoice_number} saved`);
      navigate({ to: "/create-invoice" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <ProShell><div className="max-w-4xl mx-auto px-6 py-10 text-sm text-ink/50">Loading…</div></ProShell>;
  }

  return (
    <ProShell>
      <div className="max-w-7xl mx-auto px-6 py-10">
        <button onClick={() => navigate({ to: "/create-invoice" })} className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-ink/60 hover:text-ink mb-4">
          <ArrowLeft className="h-3 w-3" /> Back to Invoices
        </button>
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <h1 className="font-display text-3xl">{isNew ? "New invoice" : "Edit invoice"}</h1>
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="lg:hidden inline-flex items-center gap-2 text-xs px-3 py-2 border border-ink/20 rounded hover:border-gold"
          >
            <Eye className="h-3.5 w-3.5" /> {previewOpen ? "Hide" : "Show"} preview
          </button>
        </div>

        <div className="grid lg:grid-cols-[1fr_minmax(0,440px)] gap-8 items-start">
          <div className="space-y-8 min-w-0">
            <Section title="Client">
              <Field label="Client name *">
                <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
              </Field>
              <Field label="Client email">
                <Input type="email" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} />
              </Field>
              <Field label="Project / job description (optional)">
                <Textarea value={form.project_description} onChange={(e) => setForm({ ...form, project_description: e.target.value })} rows={2} />
              </Field>
            </Section>

            <Section title="Dates">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Invoice date">
                  <Input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} />
                </Field>
                <Field label="Due in">
                  <div className="flex gap-2">
                    {[7, 14, 30].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setForm({ ...form, due_date: addDays(n) })}
                        className="text-xs px-3 py-2 border border-ink/20 rounded hover:border-gold"
                      >
                        {n} days
                      </button>
                    ))}
                    <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                  </div>
                </Field>
              </div>
            </Section>

            <Section title="Line items">
              <div className="space-y-2">
                {form.line_items.map((it, idx) => (
                  <div key={it.id} className="grid grid-cols-[1fr_80px_120px_120px_auto] gap-2 items-center">
                    <Input
                      placeholder="Description"
                      value={it.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                    />
                    <Input
                      type="number" step="0.01" min="0"
                      placeholder="Qty"
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 0 })}
                    />
                    <Input
                      type="number" step="0.01" min="0"
                      placeholder="Rate (£)"
                      value={it.rate_pence / 100}
                      onChange={(e) => updateItem(idx, { rate_pence: Math.round((Number(e.target.value) || 0) * 100) })}
                    />
                    <div className="text-right font-mono text-sm">{formatGBP(Math.round(it.quantity * it.rate_pence))}</div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={form.line_items.length === 1}
                      className="p-2 text-ink/40 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-3 w-3" /> Add line item
                </Button>
              </div>
            </Section>

            <Section title="Tax">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.tax_enabled} onChange={(e) => setForm({ ...form, tax_enabled: e.target.checked })} />
                Apply VAT / tax
              </label>
              {form.tax_enabled && (
                <Field label="Tax rate (%)">
                  <Input type="number" step="0.1" min="0" max="100" className="max-w-[120px]" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) || 0 })} />
                </Field>
              )}
            </Section>

            <Section title="Notes">
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Payment terms, thank-you message…" />
            </Section>

            <Section title="Payment options">
              <p className="text-xs text-ink/60 -mt-2 mb-2">
                Let clients pay by bank transfer, by card via a payment link, or both. At least one method is recommended.
              </p>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.show_bank_details}
                  onChange={(e) => setForm({ ...form, show_bank_details: e.target.checked })}
                />
                Show bank details on this invoice
              </label>
              {form.show_bank_details && (
                <Field label="Bank details">
                  <Textarea
                    rows={4}
                    value={form.bank_details}
                    onChange={(e) => setForm({ ...form, bank_details: e.target.value })}
                    placeholder={"Account name\nSort code: 12-34-56\nAccount number: 12345678\nReference: invoice number"}
                  />
                </Field>
              )}

              <div className="border-t border-ink/10 my-3" />

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.show_payment_links}
                  onChange={(e) => setForm({ ...form, show_payment_links: e.target.checked })}
                />
                Show pay-now payment links (Stripe, PayPal, GoCardless, etc.)
              </label>
              {form.show_payment_links && (
                <div className="space-y-2">
                  {form.payment_links.length === 0 && (
                    <p className="text-xs text-ink/50">No payment links yet. Add one below.</p>
                  )}
                  {form.payment_links.map((link, idx) => (
                    <div key={link.id} className="grid grid-cols-[140px_1fr_auto] gap-2 items-center">
                      <Input
                        placeholder="Label (e.g. Pay with card)"
                        value={link.label}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            payment_links: f.payment_links.map((l, i) =>
                              i === idx ? { ...l, label: e.target.value } : l,
                            ),
                          }))
                        }
                      />
                      <Input
                        type="url"
                        placeholder="https://buy.stripe.com/…"
                        value={link.url}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            payment_links: f.payment_links.map((l, i) =>
                              i === idx ? { ...l, url: e.target.value } : l,
                            ),
                          }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            payment_links: f.payment_links.filter((_, i) => i !== idx),
                          }))
                        }
                        className="p-2 text-ink/40 hover:text-red-600"
                        aria-label="Remove payment link"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {form.payment_links.length < 10 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          payment_links: [
                            ...f.payment_links,
                            { id: newId(), label: "Pay with card", url: "" },
                          ],
                        }))
                      }
                    >
                      <Plus className="h-3 w-3" /> Add payment link
                    </Button>
                  )}
                </div>
              )}
            </Section>



            <Section title="Branding">
              <p className="text-xs text-ink/60 -mt-2 mb-4">
                Your saved business branding appears on every invoice. Update it once and it applies to all future invoices.
              </p>

              <BusinessLogoUploader
                onChange={(url) => setProDefaults((d) => ({ ...d, logo_url: url }))}
              />

              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                <Field label="Business name">
                  <Input
                    value={form.business_name || proDefaults.business_name || ""}
                    placeholder="Your business name"
                    onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  />
                </Field>
                <Field label="Brand colour">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.brand_color || proDefaults.brand_color || "#C5A059"}
                      onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
                      className="h-9 w-12 rounded border border-ink/20"
                    />
                    <Input
                      value={form.brand_color || proDefaults.brand_color || ""}
                      placeholder="#C5A059"
                      onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
                    />
                  </div>
                </Field>
              </div>
              <p className="text-[11px] text-ink/50 mt-2">
                Business name and brand colour are saved to your Pro branding when you save this invoice.
              </p>
            </Section>


            <div className="border-t border-ink/10 pt-4">
              <div className="ml-auto max-w-sm space-y-1 text-sm">
                <Row label="Subtotal" value={formatGBP(subtotal)} />
                {form.tax_enabled && <Row label={`Tax (${form.tax_rate}%)`} value={formatGBP(tax)} />}
                <Row label="Total" value={formatGBP(total)} strong color={effective.brand_color} />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => navigate({ to: "/create-invoice" })}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-ink text-paper hover:bg-gold">
                {saving ? "Saving…" : "Save Invoice"}
              </Button>
            </div>
          </div>

          {/* Live preview */}
          <aside className={`${previewOpen ? "block" : "hidden"} lg:block lg:sticky lg:top-24`}>
            <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-2">Live preview</p>
            <LivePreview
              form={form}
              effective={effective}
              subtotal={subtotal}
              tax={tax}
              total={total}
            />
          </aside>
        </div>
      </div>
    </ProShell>
  );
}

function LivePreview({
  form,
  effective,
  subtotal,
  tax,
  total,
}: {
  form: FormState;
  effective: { business_name: string; logo_url: string; brand_color: string; isBranded: boolean };
  subtotal: number;
  tax: number;
  total: number;
}) {
  return (
    <div className="bg-white rounded-xl shadow-xl border border-ink/10 overflow-hidden text-[12px] text-ink">
      <div className="h-1.5" style={{ backgroundColor: effective.brand_color }} />
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            {effective.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={effective.logo_url}
                alt=""
                className="max-h-12 max-w-[160px] object-contain mb-2"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : null}
            <p className="font-semibold text-sm truncate">{effective.business_name}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold tracking-tight">INVOICE</p>
            <span
              className="inline-block mt-1 text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border"
              style={{ color: effective.brand_color, borderColor: effective.brand_color }}
            >
              Draft
            </span>
          </div>
        </div>

        <div
          className="rounded-md p-3 mb-5 border-l-[3px]"
          style={{ borderLeftColor: effective.brand_color, backgroundColor: "#f7f7f8" }}
        >
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <Meta label="Invoice no." value="INV-PREVIEW" />
            <Meta label="Issue date" value={form.invoice_date || "—"} />
            <Meta label="Due date" value={form.due_date || "—"} />
            <Meta
              label="Amount due"
              value={formatGBP(total)}
              valueClass="font-bold"
              valueStyle={{ color: effective.brand_color }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-ink/50 mb-1">From</p>
            <p className="font-medium truncate">{effective.business_name}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-ink/50 mb-1">Bill to</p>
            <p className="font-medium truncate">{form.client_name || "Client name"}</p>
            {form.client_email && <p className="text-ink/60 truncate text-[11px]">{form.client_email}</p>}
            {form.project_description && (
              <p className="text-ink/60 truncate text-[11px]">{form.project_description}</p>
            )}
          </div>
        </div>

        <div className="border-t border-ink/10 pt-2">
          <div className="grid grid-cols-[1fr_40px_60px_60px] gap-2 text-[9px] uppercase tracking-widest text-ink/50 pb-1">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Total</span>
          </div>
          <div className="divide-y divide-ink/5">
            {form.line_items.map((it) => (
              <div key={it.id} className="grid grid-cols-[1fr_40px_60px_60px] gap-2 py-1.5 text-[11px]">
                <span className="truncate">{it.description || "—"}</span>
                <span className="text-right">{it.quantity}</span>
                <span className="text-right">{formatGBP(it.rate_pence)}</span>
                <span className="text-right font-medium">{formatGBP(Math.round(it.quantity * it.rate_pence))}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 ml-auto max-w-[220px] space-y-1 text-[11px]">
          <div className="flex justify-between text-ink/60"><span>Subtotal</span><span>{formatGBP(subtotal)}</span></div>
          {form.tax_enabled && (
            <div className="flex justify-between text-ink/60"><span>Tax ({form.tax_rate}%)</span><span>{formatGBP(tax)}</span></div>
          )}
          <div
            className="flex justify-between font-bold pt-1 border-t border-ink/10 text-sm"
            style={{ color: effective.brand_color }}
          >
            <span>Total</span><span>{formatGBP(total)}</span>
          </div>
        </div>

        {(form.show_bank_details && form.bank_details.trim()) ||
        (form.show_payment_links && form.payment_links.some((l) => l.url.trim())) ? (
          <div className="mt-5 pt-4 border-t border-ink/10">
            <p className="text-[9px] uppercase tracking-widest text-ink/50 mb-2">Payment</p>
            {form.show_payment_links && form.payment_links.some((l) => l.url.trim()) && (
              <div className="space-y-1 mb-3">
                {form.payment_links
                  .filter((l) => l.url.trim())
                  .map((l) => (
                    <div
                      key={l.id}
                      className="inline-block mr-2 mb-1 text-[10px] font-medium px-3 py-1.5 rounded text-white"
                      style={{ backgroundColor: effective.brand_color }}
                    >
                      {l.label.trim() || "Pay now"}
                    </div>
                  ))}
              </div>
            )}
            {form.show_bank_details && form.bank_details.trim() && (
              <pre className="whitespace-pre-wrap font-sans text-[11px] text-ink/70 leading-snug">
                {form.bank_details.trim()}
              </pre>
            )}
          </div>
        ) : null}

        <p className="mt-5 text-center text-[9px] text-ink/40">
          Generated with Shootbase
        </p>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  valueClass,
  valueStyle,
}: {
  label: string;
  value: string;
  valueClass?: string;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div>
      <p className="text-[8px] uppercase tracking-widest text-ink/50">{label}</p>
      <p className={`text-[11px] ${valueClass ?? "font-medium"}`} style={valueStyle}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-ink/10 rounded p-5">
      <h2 className="font-display text-lg mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest text-ink/60 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <div className={`flex justify-between ${strong ? "font-display text-xl border-t border-ink/10 pt-2" : "text-ink/70"}`}>
      <span>{label}</span>
      <span className="font-mono" style={strong && color ? { color } : undefined}>{value}</span>
    </div>
  );
}
