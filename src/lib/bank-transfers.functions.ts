import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, auditLog } from "@/lib/admin/_guard";
import { resolveAdminCountry, applyCountryFilter, assertRowInScope } from "@/lib/admin/country.server";
import { notifyAdmins } from "@/lib/admin-notify.server";

const SubmitSchema = z.object({
  packageId: z.string().min(1),
  credits: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  currency: z.string().default("NGN"),
  bankName: z.string().min(1),
  transferReference: z.string().min(1),
  senderAccountName: z.string().min(1),
  paymentDate: z.string().min(1),
  receiptPath: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export const submitBankTransferRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pro, error: proErr } = await supabase
      .from("professionals")
      .select("id, business_name, contact_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (proErr) return { error: proErr.message };
    if (!pro) return { error: "Set up your professional profile first." };

    const { data: row, error } = await supabase
      .from("bank_transfer_requests")
      .insert({
        professional_id: pro.id,
        user_id: userId,
        country_code: "NG",
        country: "Nigeria",
        package_id: data.packageId,
        credits: data.credits,
        amount_minor: data.amountMinor,
        currency: data.currency,
        bank_name: data.bankName,
        transfer_reference: data.transferReference,
        sender_account_name: data.senderAccountName,
        payment_date: data.paymentDate,
        receipt_path: data.receiptPath ?? null,
        note: data.note ?? null,
        status: "pending",
      } as any)
      .select("id")
      .single();
    if (error) return { error: error.message };

    // Fire-and-forget notifications (Pro email + Admin bell+email)
    try {
      const { data: u } = await supabase.auth.getUser();
      const email = u?.user?.email ?? null;
      const proName = (pro as any).contact_name || (pro as any).business_name || null;

      // 1) Pro confirmation email
      const { sendBankTransferEmail } = await import("@/lib/bank-transfer-email.server");
      sendBankTransferEmail("submitted", row.id as string).catch((e) =>
        console.warn("[bank-transfer] pro email failed", e),
      );

      // 2) Admin bell + support email
      notifyAdmins({
        type: "payment_issue",
        title: "New bank transfer — pending review",
        message: `${proName ?? "A professional"} submitted a ₦${(data.amountMinor / 100).toLocaleString("en-NG")} transfer (ref ${data.transferReference}) for ${data.credits} coins.`,
        link: "/admin/bank-transfers",
        refId: row.id as string,
        userId,
        userName: proName,
        userEmail: email,
        userRole: "professional",
        metadata: {
          country_code: "NG",
          country: "Nigeria",
          package_id: data.packageId,
          amount_minor: data.amountMinor,
          transfer_reference: data.transferReference,
          bank_name: data.bankName,
          sender_account_name: data.senderAccountName,
          payment_date: data.paymentDate,
          credits: data.credits,
          receipt_path: data.receiptPath ?? null,
        },
      }).catch((e) => console.warn("[bank-transfer] notifyAdmins failed", e));
    } catch (e) {
      console.warn("[bank-transfer] post-submit notify failed", e);
    }

    return { ok: true as const, id: row.id as string };
  });

export const listMyBankTransferRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("bank_transfer_requests")
      .select("id, package_id, credits, amount_minor, currency, status, created_at, rejection_reason, admin_message")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return { error: error.message, items: [] };
    return { items: data ?? [] };
  });

// =====================================================================
// Admin-side review
// =====================================================================

export const listBankTransferRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["all", "pending", "approved", "rejected", "more_info_requested"]).default("pending") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "coins.bank_transfers");
    const scope = await resolveAdminCountry(context.supabase, context.userId);

    let q = context.supabase
      .from("bank_transfer_requests")
      .select(
        "id, user_id, professional_id, country_code, country, package_id, credits, amount_minor, currency, bank_name, transfer_reference, sender_account_name, payment_date, receipt_path, note, status, rejection_reason, admin_message, created_at, reviewed_at, reviewed_by, approved_at, credits_granted",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    q = applyCountryFilter(q as any, scope, "country") as typeof q;

    const { data: rows, error } = await q;
    if (error) return { error: error.message, items: [] as any[] };

    // Hydrate user names / emails
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean)));
    const proIds = Array.from(new Set((rows ?? []).map((r: any) => r.professional_id).filter(Boolean)));
    const [emailsRes, prosRes] = await Promise.all([
      userIds.length
        ? context.supabase.from("profiles").select("id, email, first_name, last_name").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      proIds.length
        ? context.supabase.from("professionals").select("id, business_name, contact_name").in("id", proIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const emailMap = new Map(((emailsRes as any).data ?? []).map((p: any) => [p.id, p]));
    const proMap = new Map(((prosRes as any).data ?? []).map((p: any) => [p.id, p]));

    return {
      items: (rows ?? []).map((r: any) => {
        const u: any = emailMap.get(r.user_id) ?? {};
        const p: any = proMap.get(r.professional_id) ?? {};
        return {
          ...r,
          email: u.email ?? null,
          professional_name: p.contact_name || p.business_name || [u.first_name, u.last_name].filter(Boolean).join(" ") || null,
        };
      }),
    };
  });

export const getBankTransferReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "coins.bank_transfers");
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("bank_transfer_requests")
      .select("id, receipt_path, country")
      .eq("id", data.id)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!row?.receipt_path) return { error: "No receipt uploaded" };
    assertRowInScope(scope, (row as any).country);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("bank-transfer-receipts")
      .createSignedUrl(row.receipt_path as string, 60 * 10); // 10 minutes
    if (sErr) return { error: sErr.message };
    return { url: signed?.signedUrl ?? null };
  });

const ResolveSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().optional(),
  message: z.string().trim().optional(),
});

async function loadAndAuthorize(supabase: any, userId: string, id: string) {
  await requirePermission(supabase, userId, "coins.bank_transfers");
  const scope = await resolveAdminCountry(supabase, userId);
  const { data: row, error } = await supabase
    .from("bank_transfer_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Transfer not found");
  assertRowInScope(scope, row.country);
  if (row.user_id === userId) throw new Error("You cannot review your own transfer.");
  return row;
}

export const approveBankTransferRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResolveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = await loadAndAuthorize(context.supabase, context.userId, data.id);
    if (row.status === "approved") return { error: "Already approved" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const credits = Number(row.credits || 0);
    const proId = row.professional_id as string;

    // 1. Credit transaction (idempotent on stripe_payment_id surrogate)
    const txKey = `bank-transfer-${row.id}`;
    const { error: txErr } = await supabaseAdmin.from("credit_transactions").insert({
      professional_id: proId,
      amount: credits,
      transaction_type: "credit_purchase",
      description: `Bank transfer ${row.transfer_reference} (₦${(row.amount_minor / 100).toLocaleString("en-NG")})`,
      stripe_payment_id: txKey,
    });
    if (txErr && (txErr as any).code !== "23505") {
      return { error: txErr.message };
    }

    // 2. Increment balance
    const { data: existing } = await supabaseAdmin
      .from("professional_credits")
      .select("credit_balance")
      .eq("professional_id", proId)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("professional_credits")
        .update({ credit_balance: (existing.credit_balance as number) + credits })
        .eq("professional_id", proId);
    } else {
      await supabaseAdmin
        .from("professional_credits")
        .insert({ professional_id: proId, credit_balance: credits });
    }

    // 3. Mark row approved
    const { error: upErr } = await context.supabase
      .from("bank_transfer_requests")
      .update({
        status: "approved",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        credits_granted: credits,
      } as any)
      .eq("id", row.id);
    if (upErr) return { error: upErr.message };

    // 4. In-app notification + email
    await context.supabase.from("notifications").insert({
      user_id: row.user_id,
      title: `${credits} coins added to your account`,
      body: `Your bank transfer ${row.transfer_reference} was approved.`,
      url: "/pro/credits",
    });

    try {
      const { sendBankTransferEmail } = await import("@/lib/bank-transfer-email.server");
      await sendBankTransferEmail("approved", row.id);
    } catch (e) {
      console.warn("[bank-transfer] approve email failed", e);
    }

    await auditLog(context.supabase, "bank_transfer.approve", "bank_transfer", row.id, {
      credits,
      amount_minor: row.amount_minor,
      reference: row.transfer_reference,
    });
    return { ok: true as const };
  });

export const rejectBankTransferRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResolveSchema.extend({ reason: z.string().trim().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const row = await loadAndAuthorize(context.supabase, context.userId, data.id);
    if (row.status === "approved") return { error: "Cannot reject an approved transfer" };

    const { error } = await context.supabase
      .from("bank_transfer_requests")
      .update({
        status: "rejected",
        rejection_reason: data.reason,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", row.id);
    if (error) return { error: error.message };

    await context.supabase.from("notifications").insert({
      user_id: row.user_id,
      title: "Bank transfer not approved",
      body: data.reason,
      url: "/pro/credits",
    });

    try {
      const { sendBankTransferEmail } = await import("@/lib/bank-transfer-email.server");
      await sendBankTransferEmail("rejected", row.id, { reason: data.reason });
    } catch (e) {
      console.warn("[bank-transfer] reject email failed", e);
    }

    await auditLog(context.supabase, "bank_transfer.reject", "bank_transfer", row.id, { reason: data.reason });
    return { ok: true as const };
  });

export const requestMoreInfoForBankTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResolveSchema.extend({ message: z.string().trim().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const row = await loadAndAuthorize(context.supabase, context.userId, data.id);
    if (row.status === "approved") return { error: "Cannot edit an approved transfer" };

    const { error } = await context.supabase
      .from("bank_transfer_requests")
      .update({
        status: "more_info_requested",
        admin_message: data.message,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", row.id);
    if (error) return { error: error.message };

    await context.supabase.from("notifications").insert({
      user_id: row.user_id,
      title: "More info needed for your bank transfer",
      body: data.message,
      url: "/pro/credits",
    });

    try {
      const { sendBankTransferEmail } = await import("@/lib/bank-transfer-email.server");
      await sendBankTransferEmail("more_info", row.id, { message: data.message });
    } catch (e) {
      console.warn("[bank-transfer] more-info email failed", e);
    }

    await auditLog(context.supabase, "bank_transfer.more_info", "bank_transfer", row.id, { message: data.message });
    return { ok: true as const };
  });
