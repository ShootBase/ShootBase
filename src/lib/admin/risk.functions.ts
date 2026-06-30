import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, auditLog } from "./_guard";
import { resolveAdminCountry, assertRowInScope } from "./country.server";

const RECOMPUTE_THRESHOLD_HOURS = 24;

async function assertUserInScope(supabase: any, userId: string, targetUserId: string) {
  const scope = await resolveAdminCountry(supabase, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: p } = await supabaseAdmin.from("profiles").select("country").eq("id", targetUserId).maybeSingle();
  assertRowInScope(scope, (p as any)?.country);
  return scope;
}

export const getUserRiskScore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), force: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    const scope = await assertUserInScope(context.supabase, context.userId, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("user_risk_scores")
      .select("*")
      .eq("user_id", data.user_id)
      .maybeSingle();

    const stale =
      !existing ||
      Date.now() - new Date(existing.computed_at).getTime() > RECOMPUTE_THRESHOLD_HOURS * 3600 * 1000;

    if (!data.force && !stale && existing) return { row: existing };

    if (data.force) {
      await requirePermission(context.supabase, context.userId, "users.edit");
    }

    const { computeRisk } = await import("@/lib/risk-engine.server");
    const result = await computeRisk(data.user_id);
    const previous = existing?.score ?? null;
    const trend =
      previous == null
        ? "stable"
        : result.score > previous + 5
          ? "rising"
          : result.score < previous - 5
            ? "decreasing"
            : "stable";
    const { data: row, error } = await supabaseAdmin
      .from("user_risk_scores")
      .upsert({
        user_id: data.user_id,
        score: result.score,
        level: result.level,
        reasons: result.reasons,
        signals: result.signals as any,
        previous_score: previous,
        trend,
        computed_at: new Date().toISOString(),
        country: scope.country,
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (data.force) {
      await auditLog(context.supabase, "risk.recompute", "user", data.user_id, { score: result.score, level: result.level });
    }
    return { row };
  });

export const listHighRiskUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ level: z.enum(["medium", "high", "critical"]).default("high") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const levels =
      data.level === "critical" ? ["critical"] :
      data.level === "high" ? ["high", "critical"] :
      ["medium", "high", "critical"];
    const { data: rows } = await supabaseAdmin
      .from("user_risk_scores")
      .select("user_id, score, level, trend, computed_at, country")
      .in("level", levels)
      .eq("country", scope.country)
      .order("score", { ascending: false })
      .limit(100);
    return { rows: rows ?? [] };
  });

export const getRiskScoresForUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_ids: z.array(z.string().uuid()).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    if (data.user_ids.length === 0) return { scores: {} as Record<string, any> };
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("user_risk_scores")
      .select("user_id, score, level, trend, country")
      .in("user_id", data.user_ids)
      .eq("country", scope.country);
    const map: Record<string, any> = {};
    (rows ?? []).forEach((r: any) => (map[r.user_id] = r));
    return { scores: map };
  });
