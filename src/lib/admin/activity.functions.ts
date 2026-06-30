import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./_guard";
import { resolveAdminCountry } from "./country.server";

export type TimelineEvent = {
  id: string;
  type: string;
  description: string;
  created_at: string;
  metadata?: any;
};


async function loadTimelineFor(supabaseAdmin: any, userId: string): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  // 1) explicit activity log
  const { data: log } = await supabaseAdmin
    .from("user_activity_log")
    .select("id, action_type, action_description, created_at, metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  for (const r of log ?? []) {
    events.push({
      id: `log:${r.id}`,
      type: r.action_type,
      description: r.action_description ?? r.action_type,
      created_at: r.created_at,
      metadata: r.metadata,
    });
  }

  // 2) jobs (bookings)
  const { data: jobs } = await supabaseAdmin
    .from("jobs")
    .select("id, title, status, created_at")
    .eq("customer_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  for (const j of jobs ?? []) {
    events.push({
      id: `job:${j.id}`,
      type: "booking",
      description: `Posted job “${j.title}” (${j.status})`,
      created_at: j.created_at,
      metadata: { job_id: j.id },
    });
  }

  // 3) support tickets
  const { data: tickets } = await supabaseAdmin
    .from("support_requests")
    .select("id, subject, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  for (const t of tickets ?? []) {
    events.push({
      id: `ticket:${t.id}`,
      type: "support",
      description: `Opened support ticket: ${t.subject ?? "(no subject)"}`,
      created_at: t.created_at,
      metadata: { ticket_id: t.id, status: t.status },
    });
  }

  // 4) coin transactions (via professional)
  const { data: pro } = await supabaseAdmin
    .from("professionals")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (pro) {
    const { data: tx } = await supabaseAdmin
      .from("credit_transactions")
      .select("id, amount, transaction_type, description, created_at")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false })
      .limit(50);
    for (const c of tx ?? []) {
      events.push({
        id: `coin:${c.id}`,
        type: "payment",
        description: `${c.amount >= 0 ? "+" : ""}${c.amount} credits — ${c.description ?? c.transaction_type}`,
        created_at: c.created_at,
        metadata: { amount: c.amount, kind: c.transaction_type },
      });
    }

    const { data: unlocks } = await supabaseAdmin
      .from("lead_unlocks")
      .select("id, job_id, created_at")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false })
      .limit(50);
    for (const u of unlocks ?? []) {
      events.push({
        id: `unlock:${u.id}`,
        type: "booking",
        description: `Unlocked lead`,
        created_at: u.created_at,
        metadata: { job_id: u.job_id },
      });
    }
  }

  // 5) admin actions taken on this user
  const { data: admin } = await supabaseAdmin
    .from("admin_audit_logs")
    .select("id, action, metadata, created_at")
    .eq("entity_type", "user")
    .eq("entity_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  for (const a of admin ?? []) {
    events.push({
      id: `admin:${a.id}`,
      type: "admin",
      description: `Admin action: ${a.action}`,
      created_at: a.created_at,
      metadata: a.metadata,
    });
  }

  events.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  return events;
}

export const getUserTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      type: z.string().max(40).optional(),
      q: z.string().trim().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let events = await loadTimelineFor(supabaseAdmin, data.user_id);
    if (data.type && data.type !== "all") events = events.filter((e) => e.type === data.type);
    if (data.q) {
      const ql = data.q.toLowerCase();
      events = events.filter((e) => e.description.toLowerCase().includes(ql));
    }
    return { events: events.slice(0, 200) };
  });

export const getPlatformActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid().optional(),
      action_type: z.string().max(40).optional(),
      q: z.string().trim().max(120).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      page: z.number().int().min(1).default(1),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "analytics.view");
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pageSize = 50;
    let q = supabaseAdmin
      .from("user_activity_log")
      .select("id, user_id, action_type, action_description, created_at, metadata, ip, user_agent, country", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((data.page - 1) * pageSize, data.page * pageSize - 1);
    if (data.user_id) q = q.eq("user_id", data.user_id);
    if (data.action_type && data.action_type !== "all") q = q.eq("action_type", data.action_type);
    if (data.q) q = q.ilike("action_description", `%${data.q}%`);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (scope.kind === "one") q = q.eq("country", scope.country);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    // attach names
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const nameById: Record<string, string> = {};
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      (profs ?? []).forEach((p: any) => (nameById[p.id] = p.full_name));
    }
    return {
      rows: (rows ?? []).map((r: any) => ({ ...r, user_name: nameById[r.user_id] ?? "—" })),
      total: count ?? 0,
      pageSize,
    };
  });

export const logActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      action_type: z.string().min(1).max(40),
      action_description: z.string().min(1).max(300),
      entity_type: z.string().max(40).optional(),
      entity_id: z.string().max(120).optional(),
      metadata: z.record(z.string(), z.any()).optional(),
      user_agent: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("log_user_activity", {
      _user_id: data.user_id,
      _action_type: data.action_type,
      _action_description: data.action_description,
      _entity_type: data.entity_type ?? undefined,
      _entity_id: data.entity_id ?? undefined,
      _metadata: data.metadata ?? {},
      _ip: undefined,
      _user_agent: data.user_agent ?? undefined,
    } as any);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
