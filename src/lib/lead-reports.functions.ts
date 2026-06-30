import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAdminCountry, assertRowInScope } from "@/lib/admin/country.server";

async function assertReportInScope(supabase: any, userId: string, reportId: string) {
  const scope = await resolveAdminCountry(supabase, userId);
  const { data } = await supabase.from("lead_reports").select("country").eq("id", reportId).maybeSingle();
  assertRowInScope(scope, data?.country);
  return scope;
}

function normaliseEmailStatus(status: string | null | undefined, errorMessage?: string | null): "delivered" | "pending" | "failed" {
  if (status === "sent" || status === "delivered") return "delivered";
  if (status === "pending" || status === "queued") return "pending";
  if (errorMessage?.includes("429") || errorMessage?.includes("rate_limited")) return "pending";
  return "failed";
}

const submitSchema = z.object({
  job_id: z.string().uuid(),
  reason: z.enum(["disconnected", "wrong_number"]),
  attempted_call: z.boolean(),
  attempted_sms: z.boolean(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const submitLeadReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (!data.attempted_call && !data.attempted_sms) {
      throw new Error("attempt_required");
    }
    const { data: id, error } = await context.supabase.rpc("submit_lead_report" as never, {
      _job_id: data.job_id,
      _reason: data.reason,
      _attempted_call: data.attempted_call,
      _attempted_sms: data.attempted_sms,
      _notes: data.notes || null,
    } as never);
    if (error) throw new Error(error.message);

    // Send submission confirmation email + in-app notification — non-blocking
    try {
      const { sendLeadDisputeSubmittedEmail } = await import(
        "@/lib/lead-dispute-email.server"
      );
      await sendLeadDisputeSubmittedEmail(id as unknown as string);
    } catch (e) {
      console.warn("[submitLeadReport] notification dispatch failed", e);
    }

    // Alert ShootBase support staff (email + bell)
    try {
      const { notifyAdmins } = await import("@/lib/admin-notify.server");
      const { data: job } = await context.supabase
        .from("jobs")
        .select("title, customer_id")
        .eq("id", data.job_id)
        .maybeSingle();
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("full_name, account_type")
        .eq("id", context.userId)
        .maybeSingle();
      const email = typeof context.claims.email === "string" ? context.claims.email : null;
      await notifyAdmins({
        type: "invalid_contact_report",
        title: `Invalid contact reported — ${data.reason === "disconnected" ? "Disconnected number" : "Wrong number"}`,
        message: data.notes || `Pro reported the contact on lead "${job?.title ?? data.job_id}" as ${data.reason}.`,
        link: `/admin/lead-reports`,
        refId: id as unknown as string,
        category: data.reason,
        userId: context.userId,
        userName: profile?.full_name ?? null,
        userEmail: email,
        userRole: (profile?.account_type as string | undefined) ?? "professional",
        relatedReportId: id as unknown as string,
        relatedLeadId: data.job_id,
        relatedJobId: data.job_id,
        relatedJobTitle: job?.title ?? null,
      });
    } catch (e) {
      console.warn("[submitLeadReport] admin notify failed", e);
    }

    return { ok: true as const, id };
  });

export type MyLeadReport = {
  id: string;
  job_id: string;
  job_title: string;
  status: "pending" | "approved" | "rejected";
  reason: "disconnected" | "wrong_number";
  credit_refunded: boolean;
  credits_refunded_amount: number | null;
  created_at: string;
  resolved_at: string | null;
  communication_history: DisputeCommunicationEvent[];
};

export type DisputeCommunicationEvent = {
  date: string;
  type: "submitted" | "approved" | "rejected";
  label: string;
  status: "delivered" | "pending" | "failed";
};

function emailLabel(type: DisputeCommunicationEvent["type"]): string {
  if (type === "submitted") return "Dispute Submitted Email";
  if (type === "approved") return "Refund Approved Email";
  return "Dispute Rejected Email";
}

function emailStatus(status: string | null | undefined, errorMessage?: string | null): DisputeCommunicationEvent["status"] {
  return normaliseEmailStatus(status, errorMessage);
}

function emailTypeFromTemplate(template?: string | null): DisputeCommunicationEvent["type"] | null {
  if (!template) return null;
  if (template.includes("submitted")) return "submitted";
  if (template.includes("approved")) return "approved";
  if (template.includes("rejected")) return "rejected";
  return null;
}

export const myLeadReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("my_lead_reports" as never);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Omit<MyLeadReport, "communication_history">[];
    const ids = rows.map((r) => r.id);
    const historyByReport: Record<string, DisputeCommunicationEvent[]> = {};

    if (ids.length > 0) {
      const messageIds = ids.flatMap((id) => [
        `lead-dispute-submitted-${id}`,
        `lead-dispute-approve-${id}`,
        `lead-dispute-reject-${id}`,
      ]);
      const { data: logs } = await context.supabase
        .from("email_send_log")
        .select("message_id, template_name, status, error_message, created_at")
        .in("message_id", messageIds)
        .order("created_at", { ascending: false });

      const latestByMessage: Record<string, { template_name: string | null; status: string; error_message: string | null; created_at: string }> = {};
      for (const log of logs ?? []) {
        if (!log.message_id || latestByMessage[log.message_id]) continue;
        latestByMessage[log.message_id] = log as { template_name: string | null; status: string; error_message: string | null; created_at: string };
      }

      for (const [messageId, log] of Object.entries(latestByMessage)) {
        const reportId = ids.find((id) => messageId.endsWith(id));
        const type = emailTypeFromTemplate(log.template_name || messageId);
        if (!reportId || !type) continue;
        historyByReport[reportId] = historyByReport[reportId] ?? [];
        historyByReport[reportId].push({
          date: log.created_at,
          type,
          label: emailLabel(type),
          status: emailStatus(log.status, log.error_message),
        });
      }
    }

    return rows.map((r) => ({
      ...r,
      communication_history: (historyByReport[r.id] ?? []).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    })) as MyLeadReport[];
  });

const listSchema = z.object({ status: z.enum(["pending", "resolved"]).optional() });
export type AdminLeadReportSummary = {
  job_id: string;
  job_title: string;
  customer_name: string;
  report_count: number;
  pending_count: number;
  quality_status: string | null;
  last_report_at: string;
  first_report_at: string;
};

export const adminListLeadReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "admin_list_lead_reports" as never,
      { _status: data.status ?? null } as never,
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as AdminLeadReportSummary[];
  });

export type AdminLeadReportDetail = {
  id: string;
  professional_id: string;
  business_name: string | null;
  reason: "disconnected" | "wrong_number";
  notes: string | null;
  attempted_call: boolean;
  attempted_sms: boolean;
  status: "pending" | "approved" | "rejected";
  credits_refunded_amount: number | null;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

export const adminGetLeadReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "admin_get_lead_reports" as never,
      { _job_id: data.job_id } as never,
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as AdminLeadReportDetail[];
  });

const resolveSchema = z.object({
  report_id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional().or(z.literal("")),
});

export const adminResolveLeadReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resolveSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertReportInScope(context.supabase, context.userId, data.report_id);
    // Optional: when 2+ pending reports exist on this job, run the
    // verification stub for audit-trail purposes. The stub currently
    // returns "unknown" so the admin still makes the final call.
    try {
      const { verifyLeadContact } = await import("@/lib/lead-verification.server");
      const { data: reportRow } = await context.supabase
        .from("lead_reports")
        .select("job_id")
        .eq("id", data.report_id)
        .maybeSingle();
      if (reportRow?.job_id) {
        const { data: job } = await context.supabase
          .from("jobs")
          .select("contact_phone")
          .eq("id", reportRow.job_id)
          .maybeSingle();
        await verifyLeadContact(reportRow.job_id, (job as { contact_phone?: string } | null)?.contact_phone ?? null);
      }
    } catch {
      /* non-blocking */
    }

    // Capture sibling pending reports BEFORE the RPC, so we can email pros
    // whose dispute the RPC auto-approves alongside the primary one.
    let cascadeReportIds: string[] = [];
    if (data.decision === "approve") {
      const { data: primary } = await context.supabase
        .from("lead_reports")
        .select("job_id")
        .eq("id", data.report_id)
        .maybeSingle();
      if (primary?.job_id) {
        const { data: siblings } = await context.supabase
          .from("lead_reports")
          .select("id")
          .eq("job_id", primary.job_id)
          .eq("status", "pending")
          .neq("id", data.report_id);
        cascadeReportIds = (siblings ?? []).map((r) => r.id);
      }
    }

    const { error } = await context.supabase.rpc("admin_resolve_lead_report" as never, {
      _report_id: data.report_id,
      _decision: data.decision,
      _note: data.note || null,
    } as never);
    if (error) throw new Error(error.message);

    // Notify professional(s) by email — non-blocking
    try {
      const { sendLeadDisputeOutcomeEmail } = await import(
        "@/lib/lead-dispute-email.server"
      );
      await sendLeadDisputeOutcomeEmail({
        reportId: data.report_id,
        decision: data.decision,
        adminNote: data.note || null,
      });
      for (const sid of cascadeReportIds) {
        await sendLeadDisputeOutcomeEmail({
          reportId: sid,
          decision: "approve",
          adminNote: "Auto-approved with primary report",
        });
      }
    } catch (e) {
      console.warn("[adminResolveLeadReport] email dispatch failed", e);
    }

    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Admin Lead Disputes Dashboard
// ---------------------------------------------------------------------------

export type AdminDisputeRow = {
  id: string;
  job_id: string;
  job_title: string;
  job_event_type: string | null;
  job_quality_status: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  professional_id: string;
  business_name: string | null;
  professional_email: string | null;
  reason: "disconnected" | "wrong_number";
  notes: string | null;
  attempted_call: boolean;
  attempted_sms: boolean;
  status: "pending" | "approved" | "rejected";
  credits_refunded_amount: number | null;
  twilio_status: "inactive" | "active" | "unknown" | null;
  twilio_checked_at: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  reports_for_job: number;
  last_email_kind: string | null;
  last_email_status: "delivered" | "pending" | "failed" | null;
  last_email_at: string | null;
};

const disputesFilterSchema = z.object({
  status: z.enum(["all", "pending", "approved", "rejected"]).optional(),
  reason: z.enum(["all", "disconnected", "wrong_number"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
});

export const adminListDisputes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => disputesFilterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    let q = context.supabase
      .from("lead_reports")
      .select(
        `id, job_id, professional_id, reason, notes, attempted_call, attempted_sms,
         status, credits_refunded_amount, twilio_status, twilio_checked_at,
         created_at, resolved_at, resolution_note, country,
         jobs:job_id ( title, event_type, contact_name, contact_phone, quality_status ),
         professionals:professional_id ( business_name, user_id )`,
      )
      .eq("country", scope.country)
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.reason && data.reason !== "all") q = q.eq("reason", data.reason);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Count reports per job (for the high-risk badge)
    const jobIds = Array.from(new Set((rows ?? []).map((r) => r.job_id)));
    const counts: Record<string, number> = {};
    if (jobIds.length > 0) {
      const { data: countRows } = await context.supabase
        .from("lead_reports")
        .select("job_id")
        .in("job_id", jobIds);
      for (const c of countRows ?? []) {
        counts[c.job_id] = (counts[c.job_id] ?? 0) + 1;
      }
    }

    // Latest email-notification event per report (for "Last email" column)
    const reportIds = (rows ?? []).map((r) => r.id);
    const latestEmail: Record<string, { kind: string | null; status: AdminDisputeRow["last_email_status"]; at: string }> = {};
    if (reportIds.length > 0) {
      const messageIds = reportIds.flatMap((id) => [
        `lead-dispute-submitted-${id}`,
        `lead-dispute-approve-${id}`,
        `lead-dispute-reject-${id}`,
      ]);
      const { data: emailLogs } = await context.supabase
        .from("email_send_log")
        .select("message_id, template_name, status, error_message, created_at")
        .in("message_id", messageIds)
        .order("created_at", { ascending: false });
      for (const log of emailLogs ?? []) {
        const messageId = String(log.message_id ?? "");
        const reportId = reportIds.find((id) => messageId.endsWith(id));
        if (!reportId || latestEmail[reportId]) continue;
        const type = emailTypeFromTemplate(log.template_name || messageId);
        if (!type) continue;
        latestEmail[reportId] = {
          kind: type === "approved" ? "approve" : type === "rejected" ? "reject" : "submitted",
          status: emailStatus(log.status, log.error_message),
          at: log.created_at,
        };
      }

      const { data: evs } = await context.supabase
        .from("lead_report_events")
        .select("report_id, action, metadata, created_at")
        .in("report_id", reportIds)
        .in("action", ["email_notification_sent", "email_notification_failed", "email_notification_retried"])
        .order("created_at", { ascending: false });
      for (const e of evs ?? []) {
        const current = latestEmail[e.report_id];
        if (current && new Date(current.at).getTime() >= new Date(e.created_at).getTime()) continue;
        const meta = (e.metadata ?? {}) as Record<string, unknown>;
        const status =
          e.action === "email_notification_failed"
            ? "failed"
            : emailStatus(meta.delivery_status as string | undefined, meta.error as string | undefined);
        latestEmail[e.report_id] = {
          kind: (meta.kind as string | undefined) ?? null,
          status,
          at: e.created_at,
        };
      }
    }

    const out: AdminDisputeRow[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      job_id: r.job_id,
      job_title: r.jobs?.title ?? "(deleted job)",
      job_event_type: r.jobs?.event_type ?? null,
      job_quality_status: r.jobs?.quality_status ?? null,
      customer_name: r.jobs?.contact_name ?? null,
      customer_phone: r.jobs?.contact_phone ?? null,
      professional_id: r.professional_id,
      business_name: r.professionals?.business_name ?? null,
      professional_email: null,
      reason: r.reason,
      notes: r.notes,
      attempted_call: r.attempted_call,
      attempted_sms: r.attempted_sms,
      status: r.status,
      credits_refunded_amount: r.credits_refunded_amount,
      twilio_status: r.twilio_status,
      twilio_checked_at: r.twilio_checked_at,
      created_at: r.created_at,
      resolved_at: r.resolved_at,
      resolution_note: r.resolution_note,
      reports_for_job: counts[r.job_id] ?? 1,
      last_email_kind: latestEmail[r.id]?.kind ?? null,
      last_email_status: latestEmail[r.id]?.status ?? null,
      last_email_at: latestEmail[r.id]?.at ?? null,
    }));

    // Lightweight client-side-ish search
    if (data.search && data.search.trim()) {
      const s = data.search.trim().toLowerCase();
      return out.filter(
        (r) =>
          r.id.toLowerCase().includes(s) ||
          r.job_id.toLowerCase().includes(s) ||
          (r.business_name ?? "").toLowerCase().includes(s) ||
          (r.customer_phone ?? "").toLowerCase().includes(s) ||
          (r.customer_name ?? "").toLowerCase().includes(s),
      );
    }
    return out;
  });

export type AdminDisputeMetrics = {
  pending: number;
  approved: number;
  rejected: number;
  credits_refunded: number;
  high_risk_leads: number;
};

export const adminDisputeMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("lead_reports")
      .select("status, credits_refunded_amount, job_id")
      .eq("country", scope.country);
    if (error) throw new Error(error.message);
    const m: AdminDisputeMetrics = {
      pending: 0,
      approved: 0,
      rejected: 0,
      credits_refunded: 0,
      high_risk_leads: 0,
    };
    const perJob: Record<string, number> = {};
    for (const r of data ?? []) {
      if (r.status === "pending") m.pending++;
      else if (r.status === "approved") {
        m.approved++;
        m.credits_refunded += r.credits_refunded_amount ?? 0;
      } else if (r.status === "rejected") m.rejected++;
      perJob[r.job_id] = (perJob[r.job_id] ?? 0) + 1;
    }
    m.high_risk_leads = Object.values(perJob).filter((c) => c >= 2).length;
    return m;
  });

export type AdminDisputeEvent = {
  id: string;
  action: string;
  created_at: string;
  metadata: Record<string, string | number | boolean | null> | null;
};

export type AdminDisputeDebug = {
  report_id: string;
  current_dispute_status: "pending" | "approved" | "rejected" | null;
  current_outcome: "pending" | "approved" | "rejected" | null;
  professional_id: string | null;
  professional_user_id: string | null;
  professional_email: string | null;
  email_queue_status: "queued" | "sent" | "failed" | "pending" | "none";
  email_queue_message_id: string | null;
  email_queue_pgmq_msg_id: number | null;
  email_queue_read_count: number | null;
  last_email_error: string | null;
  notification_created: boolean;
  notification_user_id: string | null;
  notification_id: string | null;
  last_updated_timestamp: string | null;
};

export const adminGetDisputeEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ report_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertReportInScope(context.supabase, context.userId, data.report_id);
    const { data: rows, error } = await context.supabase
      .from("lead_report_events")
      .select("id, action, metadata, created_at")
      .eq("report_id", data.report_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as AdminDisputeEvent[];
  });

export const adminGetDisputeDebug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ report_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertReportInScope(context.supabase, context.userId, data.report_id);
    const { data: rows, error } = await context.supabase.rpc(
      "admin_get_lead_dispute_debug" as never,
      { _report_id: data.report_id } as never,
    );
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("not_found");
    return row as AdminDisputeDebug;
  });

const twilioSchema = z.object({ report_id: z.string().uuid() });

export const adminRunTwilioCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => twilioSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertReportInScope(context.supabase, context.userId, data.report_id);
    // Mocked Twilio Lookup — deterministic-ish random outcome so the UI can
    // demo all three branches. Real provider integration goes in
    // lead-verification.server.ts later.
    const outcomes: Array<"inactive" | "active" | "unknown"> = [
      "inactive",
      "active",
      "unknown",
    ];
    const result = outcomes[Math.floor(Math.random() * outcomes.length)];

    const { error } = await context.supabase
      .from("lead_reports")
      .update({
        twilio_status: result,
        twilio_checked_at: new Date().toISOString(),
        twilio_details: { provider: "mock", result },
      })
      .eq("id", data.report_id);
    if (error) throw new Error(error.message);

    await context.supabase.from("lead_report_events").insert({
      report_id: data.report_id,
      action: "twilio_check_executed",
      actor_user_id: context.userId,
      metadata: { result, provider: "mock" },
    });

    return { result };
  });

const retryEmailSchema = z.object({
  report_id: z.string().uuid(),
});

export const adminRetryDisputeEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => retryEmailSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertReportInScope(context.supabase, context.userId, data.report_id);
    const { data: row, error } = await context.supabase
      .from("lead_reports")
      .select("id, status")
      .eq("id", data.report_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("not_found");
    if (row.status === "pending") throw new Error("not_resolved");

    const decision = row.status === "approved" ? "approve" : "reject";
    const { sendLeadDisputeOutcomeEmail } = await import(
      "@/lib/lead-dispute-email.server"
    );
    const res = await sendLeadDisputeOutcomeEmail({
      reportId: data.report_id,
      decision,
      retry: true,
    });
    return res;
  });

