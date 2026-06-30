import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, auditLog } from "./_guard";
import { resolveAdminCountry, assertRowInScope } from "./country.server";

const promoSchema = z.object({
  code: z.string().trim().min(3).max(40).regex(/^[A-Z0-9_-]+$/i),
  description: z.string().trim().max(200).optional(),
  discount_type: z.enum(["percent", "fixed", "credits"]),
  discount_value: z.number().int().positive().max(100000),
  applies_to_role: z.enum(["customer", "professional"]).nullable().optional(),
  applies_to_user_id: z.string().uuid().nullable().optional(),
  max_uses: z.number().int().positive().nullable().optional(),
  valid_from: z.string().datetime().nullable().optional(),
  valid_until: z.string().datetime().nullable().optional(),
});

export const listPromoCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.enum(["all", "active", "inactive"]).default("all"),
      q: z.string().trim().max(80).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "users.view");
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("promo_codes")
      .select("*")
      .or(`country.eq.${scope.country},country.is.null`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status === "active") q = q.eq("active", true);
    if (data.status === "inactive") q = q.eq("active", false);
    if (data.q) q = q.ilike("code", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const createPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => promoSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "settings.manage");
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, data: row } = await supabaseAdmin
      .from("promo_codes")
      .insert({
        code: data.code.toUpperCase(),
        description: data.description ?? null,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        applies_to_role: data.applies_to_role ?? null,
        applies_to_user_id: data.applies_to_user_id ?? null,
        max_uses: data.max_uses ?? null,
        valid_from: data.valid_from ?? null,
        valid_until: data.valid_until ?? null,
        created_by: context.userId,
        country: scope.country,
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "promo.create", "promo_code", row.id, { code: row.code });
    return { ok: true, id: row.id };
  });

async function assertPromoInScope(supabase: any, userId: string, id: string) {
  const scope = await resolveAdminCountry(supabase, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: r } = await supabaseAdmin.from("promo_codes").select("country").eq("id", id).maybeSingle();
  if (r && (r as any).country) assertRowInScope(scope, (r as any).country);
}

export const togglePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "settings.manage");
    await assertPromoInScope(context.supabase, context.userId, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("promo_codes").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "promo.toggle", "promo_code", data.id, { active: data.active });
    return { ok: true };
  });

export const deletePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "settings.manage");
    await assertPromoInScope(context.supabase, context.userId, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("promo_codes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditLog(context.supabase, "promo.delete", "promo_code", data.id, {});
    return { ok: true };
  });
