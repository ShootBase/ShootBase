import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, auditLog } from "./_guard";
import { resolveAdminCountry } from "./country.server";

const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const ASSIGNED_FILTER = ["all", "unassigned", "mine", "user"] as const;

async function hasPerm(supabase: any, userId: string, perm: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_staff_permission", { _uid: userId, _perm: perm });
  return Boolean(data);
}

export const listTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["all", ...TICKET_STATUSES]).default("all"),
        q: z.string().trim().max(200).optional(),
        page: z.number().int().min(1).default(1),
        assigned: z.enum(ASSIGNED_FILTER).default("all"),
        assigned_user_id: z.string().uuid().optional(),
        sentiment: z.enum(["all", "angry", "frustrated", "neutral", "positive"]).default("all"),
        overridden: z.enum(["all", "ai", "manual"]).default("all"),
        sort: z.enum(["priority", "recent"]).default("priority"),
        role: z.enum(["all", "client", "pro"]).default("all"),
        priority: z.enum(["all", "low", "medium", "high", "urgent"]).default("all"),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const canViewAll = await hasPerm(context.supabase, context.userId, "tickets.view");
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _uid: context.userId });
    if (!canViewAll && !isStaff) {
      throw new Error("Forbidden: missing permission tickets.view");
    }

    const pageSize = 25;
    let query = context.supabase
      .from("support_requests")
      .select(
        "id, name, email, role, category, message, status, created_at, updated_at, user_id, assigned_to, assigned_by, assigned_at, priority, first_response_due_at, resolution_due_at, first_responded_at, resolved_at, ai_priority, ai_priority_confidence, ai_sentiment, ai_sentiment_confidence, ai_keywords, priority_overridden, admin_viewed_at",
        { count: "exact" },
      );

    if (data.sort === "priority") {
      // Postgres sorts enums by declaration order; support_priority is declared
      // low,medium,high,urgent — sort descending so urgent comes first.
      query = query
        .order("priority", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false });
    } else {
      query = query.order("updated_at", { ascending: false });
    }
    query = query.range((data.page - 1) * pageSize, data.page * pageSize - 1);

    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.sentiment !== "all") query = query.eq("ai_sentiment", data.sentiment);
    if (data.overridden === "manual") query = query.eq("priority_overridden", true);
    if (data.overridden === "ai") query = query.eq("priority_overridden", false);
    if (data.role !== "all") query = query.eq("role", data.role);
    if (data.priority !== "all") query = query.eq("priority", data.priority);
    if (data.date_from) query = query.gte("created_at", data.date_from);
    if (data.date_to) query = query.lte("created_at", data.date_to);

    // Country scoping — enforced server-side so URL hacking cannot bypass it.
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    if (scope.kind === "one") query = query.eq("country", scope.country);

    if (!canViewAll) {
      query = query.eq("assigned_to", context.userId);
    } else if (data.assigned === "mine") {
      query = query.eq("assigned_to", context.userId);
    } else if (data.assigned === "unassigned") {
      query = query.is("assigned_to", null);
    } else if (data.assigned === "user" && data.assigned_user_id) {
      query = query.eq("assigned_to", data.assigned_user_id);
    }

    if (data.q) {
      const q = data.q.replace(/[%,]/g, " ").trim();
      const filters = [
        `email.ilike.%${q}%`,
        `name.ilike.%${q}%`,
        `message.ilike.%${q}%`,
        `category.ilike.%${q}%`,
      ];
      if (/^[0-9a-fA-F-]{4,}$/.test(q)) filters.push(`id::text.ilike.${q}%`);
      query = query.or(filters.join(","));
    }

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);

    // Hydrate assignee names.
    const assigneeIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.assigned_to).filter(Boolean)),
    ) as string[];
    const assignees: Record<string, { full_name: string | null; email: string }> = {};
    if (assigneeIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", assigneeIds);
      const nameMap: Record<string, string | null> = {};
      for (const p of profs ?? []) nameMap[p.id] = p.full_name ?? null;
      for (const id of assigneeIds) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        assignees[id] = {
          full_name: nameMap[id] ?? null,
          email: u?.user?.email ?? "—",
        };
      }
    }

    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        assignee: r.assigned_to ? assignees[r.assigned_to] ?? null : null,
      })),
      total: count ?? 0,
      pageSize,
      canManage: await hasPerm(context.supabase, context.userId, "tickets.manage"),
    };
  });

export const getTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const canViewAll = await hasPerm(context.supabase, context.userId, "tickets.view");
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _uid: context.userId });
    if (!canViewAll && !isStaff) throw new Error("Forbidden");

    const { data: ticket, error } = await context.supabase
      .from("support_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Not found");

    if (!canViewAll && ticket.assigned_to !== context.userId) {
      throw new Error("Forbidden: ticket not assigned to you");
    }

    const { data: entries } = await context.supabase
      .from("admin_notes")
      .select(
        "id, body, created_at, author_user_id, is_public, email_sent, email_sent_at, email_status, email_error, email_provider_message_id, email_log_id",
      )
      .eq("support_request_id", data.id)
      .order("created_at", { ascending: true });
    const all = entries ?? [];

    // Hydrate live email_send_log status for public replies (and back-fill
    // admin_notes if the queue updated the underlying log after the reply
    // was first stored).
    const publicReplies = all.filter((n: any) => n.is_public);
    const messageIds = publicReplies.map((n: any) => n.email_log_id).filter(Boolean) as string[];
    if (messageIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: logs } = await supabaseAdmin
        .from("email_send_log")
        .select("message_id, status, error_message, created_at, recipient_email")
        .in("message_id", messageIds);
      const byKey = new Map<string, any>();
      for (const r of logs ?? []) {
        if (!r.message_id) continue;
        const prev = byKey.get(r.message_id as string);
        // Prefer the most informative row: sent > failed/dlq > pending.
        const rank = (s: string) =>
          s === "sent" ? 3 : s === "failed" || s === "dlq" ? 2 : s === "pending" ? 1 : 0;
        if (!prev || rank(r.status) >= rank(prev.status)) byKey.set(r.message_id as string, r);
      }
      for (const reply of publicReplies) {
        const log = reply.email_log_id ? byKey.get(reply.email_log_id) : null;
        if (!log) continue;
        const isSent = log.status === "sent";
        reply.email_status = log.status;
        reply.email_error = log.error_message ?? null;
        reply.email_sent = isSent;
        reply.email_sent_at = isSent ? log.created_at : reply.email_sent_at ?? null;
      }
      // Persist any changes back so future loads see fresh status.
      const updates = publicReplies.filter((n: any) => byKey.has(n.email_log_id));
      for (const u of updates) {
        await supabaseAdmin
          .from("admin_notes")
          .update({
            email_sent: u.email_sent,
            email_sent_at: u.email_sent_at,
            email_status: u.email_status,
            email_error: u.email_error,
          })
          .eq("id", u.id);
      }
    }

    let assignee: { full_name: string | null; email: string } | null = null;
    if (ticket.assigned_to) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", ticket.assigned_to)
        .maybeSingle();
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(ticket.assigned_to);
      assignee = {
        full_name: prof?.full_name ?? null,
        email: u?.user?.email ?? "—",
      };
    }

    // Auto mark-as-read for admins/staff who can view this ticket.
    try {
      await context.supabase
        .from("support_requests")
        .update({ admin_viewed_at: new Date().toISOString(), admin_viewed_by: context.userId })
        .eq("id", data.id);
    } catch {
      // non-fatal
    }

    return {
      ticket: { ...ticket, assignee },
      replies: all.filter((n: any) => n.is_public),
      notes: all.filter((n: any) => !n.is_public),
    };
  });

export const markTicketViewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const canViewAll = await hasPerm(context.supabase, context.userId, "tickets.view");
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _uid: context.userId });
    if (!canViewAll && !isStaff) throw new Error("Forbidden");
    const { error } = await context.supabase
      .from("support_requests")
      .update({ admin_viewed_at: new Date().toISOString(), admin_viewed_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(TICKET_STATUSES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Assignees can change status on their own ticket; otherwise require tickets.manage.
    const canManage = await hasPerm(context.supabase, context.userId, "tickets.manage");
    if (!canManage) {
      const { data: t } = await context.supabase
        .from("support_requests")
        .select("assigned_to")
        .eq("id", data.id)
        .maybeSingle();
      if (!t || t.assigned_to !== context.userId) {
        throw new Error("Forbidden: missing permission tickets.manage");
      }
    }
    const { error } = await context.supabase
      .from("support_requests")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "ticket.status", "support_request", data.id, {
      status: data.status,
    });
    return { ok: true };
  });

export const assignTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        assignee_user_id: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "tickets.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Validate assignee is active staff.
    if (data.assignee_user_id) {
      const { data: s } = await supabaseAdmin
        .from("staff_accounts")
        .select("user_id, status")
        .eq("user_id", data.assignee_user_id)
        .maybeSingle();
      if (!s || s.status !== "active") {
        throw new Error("Assignee must be an active staff member");
      }
    }

    const now = new Date().toISOString();
    const { data: prev } = await supabaseAdmin
      .from("support_requests")
      .select("id, assigned_to, category, message")
      .eq("id", data.id)
      .maybeSingle();
    if (!prev) throw new Error("Ticket not found");

    const { error } = await supabaseAdmin
      .from("support_requests")
      .update({
        assigned_to: data.assignee_user_id,
        assigned_by: data.assignee_user_id ? context.userId : null,
        assigned_at: data.assignee_user_id ? now : null,
        updated_at: now,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Notify the new assignee in-app.
    if (data.assignee_user_id && data.assignee_user_id !== prev.assigned_to) {
      const preview = (prev.message ?? "").slice(0, 160);
      await supabaseAdmin.from("notifications").insert({
        user_id: data.assignee_user_id,
        title: `Ticket assigned: ${prev.category ?? "Support request"}`,
        body: `#${data.id.slice(0, 8)} — ${preview}`,
        url: `/admin/tickets/${data.id}`,
      });
    }

    await auditLog(
      context.supabase,
      data.assignee_user_id ? "ticket.assign" : "ticket.unassign",
      "support_request",
      data.id,
      { assignee_user_id: data.assignee_user_id, previous: prev.assigned_to },
    );
    return { ok: true };
  });

export const listAssignableStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "tickets.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: staff, error } = await supabaseAdmin
      .from("staff_accounts")
      .select("user_id, role, status")
      .eq("status", "active");
    if (error) throw new Error(error.message);
    const ids = (staff ?? []).map((s) => s.user_id);
    if (ids.length === 0) return { staff: [] };
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    const nameMap: Record<string, string | null> = {};
    for (const p of profs ?? []) nameMap[p.id] = p.full_name ?? null;
    const out: { user_id: string; role: string; full_name: string | null; email: string }[] = [];
    for (const s of staff ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(s.user_id);
      out.push({
        user_id: s.user_id,
        role: s.role,
        full_name: nameMap[s.user_id] ?? null,
        email: u?.user?.email ?? "—",
      });
    }
    out.sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));
    return { staff: out };
  });

export const addInternalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "tickets.reply");
    const { error } = await context.supabase.from("admin_notes").insert({
      support_request_id: data.id,
      author_user_id: context.userId,
      body: data.body,
      is_public: false,
    });
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "ticket.note", "support_request", data.id, {});
    return { ok: true };
  });

export const replyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(10000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "tickets.reply");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ticket } = await supabaseAdmin
      .from("support_requests")
      .select("user_id, email, name, category, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!ticket) throw new Error("Ticket not found");

    // Resolve the canonical recipient email + display name. Prefer the
    // owning auth user (account email) so replies always reach the user's
    // login inbox, falling back to whatever was captured on the ticket.
    let recipientEmail: string | null = ticket.email ?? null;
    let recipientName: string | null = ticket.name ?? null;
    if (ticket.user_id) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(ticket.user_id);
        if (u?.user?.email) recipientEmail = u.user.email;
      } catch {
        // non-fatal
      }
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", ticket.user_id)
        .maybeSingle();
      if (prof?.full_name) recipientName = prof.full_name;
    }

    const now = new Date().toISOString();
    const { data: reply, error: insertErr } = await supabaseAdmin
      .from("admin_notes")
      .insert({
        support_request_id: data.id,
        author_user_id: context.userId,
        body: data.body,
        is_public: true,
        email_status: recipientEmail ? "pending" : "no_recipient",
      } as any)
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    if (ticket.user_id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: ticket.user_id,
        title: "New message from Shootbase Support",
        body: data.body.slice(0, 280),
        url: "/help",
      });
    }

    await supabaseAdmin
      .from("support_requests")
      .update({
        status: ticket.status === "open" ? "in_progress" : ticket.status,
        first_responded_at: now,
        updated_at: now,
      } as any)
      .eq("id", data.id);

    let emailQueued = false;
    let emailStatus: string = recipientEmail ? "pending" : "no_recipient";
    let emailError: string | null = recipientEmail ? null : "No recipient email on file";
    let emailLogId: string | null = null;

    if (recipientEmail) {
      try {
        const { enqueueSupportReplyEmail } = await import(
          "@/lib/support-reply-email.server"
        );
        const result = await enqueueSupportReplyEmail({
          ticketId: data.id,
          recipientEmail,
          recipientName,
          body: data.body,
          category: ticket.category,
          replyId: reply.id,
        });
        emailQueued = result.queued;
        emailLogId = result.messageId;
        if (!result.queued) {
          emailStatus = "failed";
          emailError = result.error || "Email enqueue failed";
        }
      } catch (err) {
        emailStatus = "failed";
        emailError = err instanceof Error ? err.message : "Email enqueue threw";
        console.warn("[ticket.reply] email enqueue failed", err);
      }
    }

    await supabaseAdmin
      .from("admin_notes")
      .update({
        email_status: emailStatus,
        email_error: emailError,
        email_log_id: emailLogId,
      } as any)
      .eq("id", reply.id);

    await auditLog(context.supabase, "ticket.reply", "support_request", data.id, {
      reply_id: reply.id,
      email_status: emailStatus,
    });
    return {
      ok: true,
      reply: {
        id: reply.id,
        body: data.body,
        created_at: now,
        author_user_id: context.userId,
        is_public: true,
        email_sent: false,
        email_status: emailStatus,
        email_error: emailError,
        email_log_id: emailLogId,
      },
      emailQueued,
      emailStatus,
      emailError,
    };
  });

export const retryTicketReplyEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), reply_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "tickets.reply");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reply } = await supabaseAdmin
      .from("admin_notes")
      .select("id, body, support_request_id, is_public, email_log_id")
      .eq("id", data.reply_id)
      .maybeSingle();
    if (!reply || reply.support_request_id !== data.id) {
      throw new Error("Reply not found");
    }
    if (!reply.is_public) throw new Error("Only public replies can be emailed");

    const { data: ticket } = await supabaseAdmin
      .from("support_requests")
      .select("user_id, email, name, category")
      .eq("id", data.id)
      .maybeSingle();
    if (!ticket) throw new Error("Ticket not found");

    let recipientEmail: string | null = ticket.email ?? null;
    let recipientName: string | null = ticket.name ?? null;
    if (ticket.user_id) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(ticket.user_id);
        if (u?.user?.email) recipientEmail = u.user.email;
      } catch {
        // non-fatal
      }
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", ticket.user_id)
        .maybeSingle();
      if (prof?.full_name) recipientName = prof.full_name;
    }
    if (!recipientEmail) throw new Error("No recipient email on file");

    // Use a retry-suffixed idempotency key so a previously stuck/failed send
    // gets a fresh log row instead of being deduped.
    const attempt = Math.floor(Date.now() / 1000);
    const { enqueueSupportReplyEmail } = await import(
      "@/lib/support-reply-email.server"
    );
    const result = await enqueueSupportReplyEmail({
      ticketId: data.id,
      recipientEmail,
      recipientName,
      body: reply.body,
      category: ticket.category,
      replyId: reply.id,
      attempt,
    });

    const emailStatus = result.queued ? "pending" : "failed";
    const emailError = result.queued ? null : result.error || "Retry enqueue failed";
    await supabaseAdmin
      .from("admin_notes")
      .update({
        email_status: emailStatus,
        email_error: emailError,
        email_log_id: result.messageId,
        email_sent: false,
        email_sent_at: null,
      } as any)
      .eq("id", reply.id);

    await auditLog(context.supabase, "ticket.reply.retry_email", "support_request", data.id, {
      reply_id: reply.id,
      email_status: emailStatus,
    });

    return { ok: result.queued, status: emailStatus, error: emailError };
  });

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const updateTicketPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), priority: z.enum(PRIORITIES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "tickets.manage");
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("support_requests")
      .update({
        priority: data.priority,
        priority_overridden: true,
        priority_overridden_by: context.userId,
        priority_overridden_at: now,
        updated_at: now,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "ticket.priority", "support_request", data.id, {
      priority: data.priority,
      overridden: true,
    });
    return { ok: true };
  });
