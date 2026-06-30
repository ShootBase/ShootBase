import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./_guard";
import { resolveAdminCountry } from "./country.server";

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        action: z.string().max(100).optional(),
        page: z.number().int().min(1).default(1),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "audit.view");
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const pageSize = 50;
    let q = context.supabase
      .from("admin_audit_logs")
      .select("id, action, entity_type, entity_id, actor_user_id, metadata, created_at, country", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range((data.page - 1) * pageSize, data.page * pageSize - 1);
    if (data.action) q = q.ilike("action", `%${data.action}%`);
    if (scope.kind === "one") q = q.eq("country", scope.country);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    // Fetch actor names
    const ids = Array.from(new Set((rows ?? []).map((r) => r.actor_user_id).filter(Boolean)));
    const names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids as string[]);
      for (const p of profs ?? []) names[p.id] = p.full_name ?? "—";
    }

    return {
      rows: (rows ?? []).map((r) => ({ ...r, actor_name: r.actor_user_id ? names[r.actor_user_id] ?? "—" : "System" })),
      total: count ?? 0,
      pageSize,
    };
  });
