import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type LineItem = {
  id: string;
  description: string;
  quantity: number;
  rate_pence: number;
};

export type PaymentLink = {
  id: string;
  label: string;
  url: string;
};

export type Invoice = {
  id: string;
  user_id: string;
  invoice_number: string;
  status: 'draft' | 'sent' | 'paid';
  client_name: string;
  client_email: string | null;
  project_description: string | null;
  invoice_date: string;
  due_date: string | null;
  line_items: LineItem[];
  tax_enabled: boolean;
  tax_rate: number;
  subtotal_pence: number;
  tax_pence: number;
  total_pence: number;
  notes: string | null;
  business_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  bank_details: string | null;
  payment_links: PaymentLink[];
  show_bank_details: boolean;
  show_payment_links: boolean;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

const ACTIVE_SUB_STATUSES = ['active', 'trialing', 'past_due'];

/** Returns true if the signed-in user has an active Pro subscription. */
export const getInvoiceAccess = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!pro) return { isPro: false as const };
    const { data: subs } = await supabase
      .from('credit_subscriptions')
      .select('status, current_period_end, cancel_at_period_end')
      .eq('professional_id', pro.id)
      .order('created_at', { ascending: false })
      .limit(5);
    const active = (subs ?? []).find((s) => ACTIVE_SUB_STATUSES.includes(s.status));
    return { isPro: Boolean(active), subscription: active ?? null };
  });

async function assertPro(supabase: any, userId: string) {
  const { data: pro } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!pro) throw new Error('Pro subscription required');
  const { data: subs } = await supabase
    .from('credit_subscriptions')
    .select('status')
    .eq('professional_id', pro.id);
  const active = (subs ?? []).some((s: { status: string }) => ACTIVE_SUB_STATUSES.includes(s.status));
  if (!active) throw new Error('Pro subscription required');
}

export const listInvoices = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Invoice[];
  });

export const getInvoice = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', data.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return (row ?? null) as unknown as Invoice | null;
  });

const lineItemSchema = z.object({
  id: z.string(),
  description: z.string().max(500),
  quantity: z.number().min(0).max(10000),
  rate_pence: z.number().int().min(0).max(100_000_000),
});

const paymentLinkSchema = z.object({
  id: z.string(),
  label: z.string().trim().max(120),
  url: z.string().trim().url('Enter a valid payment link URL').max(2000),
});

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  client_name: z.string().trim().min(1).max(200),
  client_email: z.string().trim().email().max(255).optional().nullable(),
  project_description: z.string().max(2000).optional().nullable(),
  invoice_date: z.string(),
  due_date: z.string().optional().nullable(),
  line_items: z.array(lineItemSchema).max(100),
  tax_enabled: z.boolean(),
  tax_rate: z.number().min(0).max(100),
  notes: z.string().max(2000).optional().nullable(),
  business_name: z.string().max(200).optional().nullable(),
  logo_url: z.string().max(2000).optional().nullable(),
  brand_color: z.string().max(20).optional().nullable(),
  bank_details: z.string().max(2000).optional().nullable(),
  payment_links: z.array(paymentLinkSchema).max(10).optional().default([]),
  show_bank_details: z.boolean().optional().default(false),
  show_payment_links: z.boolean().optional().default(false),
});

function computeTotals(items: LineItem[], taxEnabled: boolean, taxRate: number) {
  const subtotal = items.reduce((s, it) => s + Math.round(it.quantity * it.rate_pence), 0);
  const tax = taxEnabled ? Math.round((subtotal * taxRate) / 100) : 0;
  return { subtotal, tax, total: subtotal + tax };
}

export const saveInvoice = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPro(supabase, userId);
    const totals = computeTotals(data.line_items, data.tax_enabled, data.tax_rate);
    const payload = {
      user_id: userId,
      client_name: data.client_name,
      client_email: data.client_email ?? null,
      project_description: data.project_description ?? null,
      invoice_date: data.invoice_date,
      due_date: data.due_date ?? null,
      line_items: data.line_items,
      tax_enabled: data.tax_enabled,
      tax_rate: data.tax_rate,
      subtotal_pence: totals.subtotal,
      tax_pence: totals.tax,
      total_pence: totals.total,
      notes: data.notes ?? null,
      business_name: data.business_name ?? null,
      logo_url: data.logo_url ?? null,
      brand_color: data.brand_color ?? null,
      bank_details: data.bank_details ?? null,
      payment_links: data.payment_links ?? [],
      show_bank_details: data.show_bank_details ?? false,
      show_payment_links: data.show_payment_links ?? false,
    };
    if (data.id) {
      const { data: row, error } = await supabase
        .from('invoices')
        .update(payload)
        .eq('id', data.id)
        .eq('user_id', userId)
        .select('*')
        .single();
      if (error) throw error;
      return row as unknown as Invoice;
    }
    const { data: row, error } = await supabase
      .from('invoices')
      .insert(payload as any)
      .select('*')
      .single();
    if (error) throw error;
    return row as unknown as Invoice;
  });

export const setInvoiceStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(['draft', 'sent', 'paid']) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPro(supabase, userId);
    const patch: { status: 'draft' | 'sent' | 'paid'; sent_at?: string; paid_at?: string } = {
      status: data.status,
    };
    if (data.status === 'sent') patch.sent_at = new Date().toISOString();
    if (data.status === 'paid') patch.paid_at = new Date().toISOString();
    const { error } = await supabase
      .from('invoices')
      .update(patch)
      .eq('id', data.id)
      .eq('user_id', userId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteInvoice = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', data.id)
      .eq('user_id', userId);
    if (error) throw error;
    return { ok: true };
  });

async function signLogoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path; // legacy full URL
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin.storage
      .from('business-logos')
      .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

async function resolveBranding(supabase: any, userId: string, invoice: Invoice) {
  const { data: pro } = await supabase
    .from('professionals')
    .select('business_name, contact_name, logo_url, logo_storage_path, brand_color')
    .eq('user_id', userId)
    .maybeSingle();
  const proRow = (pro ?? {}) as {
    business_name?: string | null;
    contact_name?: string | null;
    logo_url?: string | null;
    logo_storage_path?: string | null;
    brand_color?: string | null;
  };
  const businessName =
    invoice.business_name?.trim() || proRow.business_name || null;
  const proName = proRow.contact_name?.trim() || null;
  let fromName = businessName || proName || null;
  if (!fromName) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();
    const fullName = (profile as { full_name?: string | null } | null)?.full_name?.trim() || null;
    if (fullName) fromName = fullName;
  }
  if (!fromName) {
    const { data: userRes } = await supabase.auth.getUser();
    const email = userRes?.user?.email as string | undefined;
    if (email) fromName = email.split('@')[0];
  }
  if (!fromName) fromName = 'Your photographer';

  // Logo precedence: invoice override URL → pro signed storage path → legacy pro logo_url
  let logoUrl: string | null = invoice.logo_url?.trim() || null;
  if (!logoUrl) {
    if (proRow.logo_storage_path) logoUrl = await signLogoUrl(proRow.logo_storage_path);
    else if (proRow.logo_url) logoUrl = proRow.logo_url;
  }
  const brandColor = (invoice.brand_color?.trim() || proRow.brand_color || null) ?? null;
  return { fromName, branding: { businessName: businessName || fromName, logoUrl, brandColor } };
}

/** Returns the signed-in pro's saved branding for live invoice preview. */
export const getProBranding = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase
      .from('professionals')
      .select('business_name, contact_name, logo_url, logo_storage_path, brand_color')
      .eq('user_id', userId)
      .maybeSingle();
    const p = (pro ?? {}) as {
      business_name?: string | null;
      contact_name?: string | null;
      logo_url?: string | null;
      logo_storage_path?: string | null;
      brand_color?: string | null;
    };
    const logo_url = p.logo_storage_path
      ? await signLogoUrl(p.logo_storage_path)
      : (p.logo_url ?? null);
    return {
      business_name: p.business_name ?? p.contact_name ?? null,
      logo_url,
      brand_color: p.brand_color ?? null,
      has_logo: Boolean(p.logo_storage_path || p.logo_url),
    };
  });

const brandingSchema = z.object({
  business_name: z.string().trim().max(200).nullable().optional(),
  brand_color: z.string().trim().max(20).nullable().optional(),
});

export const saveProBranding = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => brandingSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: { business_name?: string | null; brand_color?: string | null } = {};
    if (data.business_name !== undefined) patch.business_name = data.business_name || null;
    if (data.brand_color !== undefined) patch.brand_color = data.brand_color || null;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase
      .from('professionals')
      .update(patch as any)
      .eq('user_id', userId);


    if (error) throw error;
    return { ok: true };
  });

/** After the client uploads the logo file to storage, store its path on the pro record. */
export const setProLogoPath = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Path must be inside the user's folder
    if (!data.path.startsWith(`${userId}/`)) throw new Error('Invalid path');
    const { error } = await supabase
      .from('professionals')
      .update({ logo_storage_path: data.path, logo_url: null } as any)
      .eq('user_id', userId);
    if (error) throw error;
    return { ok: true, url: await signLogoUrl(data.path) };
  });

export const removeProLogo = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase
      .from('professionals')
      .select('logo_storage_path')
      .eq('user_id', userId)
      .maybeSingle();
    const path = (pro as { logo_storage_path?: string | null } | null)?.logo_storage_path ?? null;
    if (path) {
      try {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        await supabaseAdmin.storage.from('business-logos').remove([path]);
      } catch {
        // ignore storage cleanup errors
      }
    }
    const { error } = await supabase
      .from('professionals')
      .update({ logo_storage_path: null, logo_url: null } as any)
      .eq('user_id', userId);
    if (error) throw error;
    return { ok: true };
  });


/** Generate (if needed) and return a signed URL for the invoice PDF. Pro only. */
export const getInvoicePdfUrl = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPro(supabase, userId);

    const { data: row, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', data.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error('Invoice not found');
    const invoice = row as unknown as Invoice;

    const { fromName, branding } = await resolveBranding(supabase, userId, invoice);

    const { generateInvoicePdf, invoicePdfFilename } = await import('@/lib/invoice-pdf');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const pdfBytes = await generateInvoicePdf({ invoice, fromName, branding });
    const path = `${userId}/${invoice.id}/${invoicePdfFilename(invoice)}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from('invoice-pdfs')
      .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw upErr;
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from('invoice-pdfs')
      .createSignedUrl(path, 60 * 60);
    if (sErr) throw sErr;
    return { url: signed?.signedUrl ?? null, filename: invoicePdfFilename(invoice) };
  });

export const sendInvoiceEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPro(supabase, userId);

    const { data: row, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', data.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error('Invoice not found');
    const invoice = row as unknown as Invoice;
    if (!invoice.client_email) throw new Error('Add a client email to send this invoice.');

    const { fromName, branding } = await resolveBranding(supabase, userId, invoice);

    const { enqueueInvoiceEmail } = await import('@/lib/invoice-email.server');
    const result = await enqueueInvoiceEmail({ invoice, fromName, branding });
    if (!result.ok) {
      throw new Error(`Could not send invoice (${result.reason ?? 'unknown'})`);
    }

    await supabase
      .from('invoices')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', invoice.id)
      .eq('user_id', userId);

    return { ok: true };
  });
