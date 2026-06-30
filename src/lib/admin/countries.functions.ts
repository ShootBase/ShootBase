import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const StatusEnum = z.enum(["live", "preview", "disabled"]);

const UpdateSchema = z.object({
  code: z.string().min(2).max(8),
  status: StatusEnum.optional(),
  launch_status: z.string().max(40).optional(),
  domain: z.string().max(120).optional(),
  currency: z.string().max(8).optional(),
  currency_symbol: z.string().max(4).optional(),
  payment_provider: z.string().max(40).optional(),
  phone_code: z.string().max(8).optional(),
  support_email: z.string().email().optional(),
});

const StatusActionSchema = z.object({
  code: z.string().min(2).max(8),
  status: StatusEnum,
});

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("staff_accounts")
    .select("role,status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.status !== "active" || data.role !== "super_admin") {
    throw new Error("Forbidden: super_admin required");
  }
}

export const listCountries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("platform_countries")
      .select("*")
      .order("code");
    if (error) throw error;
    return data ?? [];
  });

export const updateCountry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { code, ...rest } = data;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(rest)) {
      if (typeof v !== "undefined") patch[k] = v;
    }
    // Keep legacy `active` in sync with status so older queries still work.
    if (typeof data.status !== "undefined") {
      patch.active = data.status === "live";
      if (data.status === "live") patch.launch_status = "live";
      else if (data.status === "preview") patch.launch_status = "preview";
      else patch.launch_status = "coming_soon";
    }
    const { data: row, error } = await context.supabase
      .from("platform_countries")
      .update(patch as never)
      .eq("code", code)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return row;
  });

/**
 * Single entry point for status transitions (preview / disabled / live).
 * Launching a country is just `setCountryStatus({code, status:'live'})`.
 */
export const setCountryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StatusActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const patch: Record<string, unknown> = {
      status: data.status,
      active: data.status === "live",
      launch_status:
        data.status === "live" ? "live" : data.status === "preview" ? "preview" : "coming_soon",
      updated_at: new Date().toISOString(),
    };
    const { data: row, error } = await context.supabase
      .from("platform_countries")
      .update(patch as never)
      .eq("code", data.code)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    await context.supabase.rpc("log_admin_action", {
      _action: `country.${data.status}`,
      _entity_type: "country",
      _entity_id: data.code,
      _metadata: {},
    });
    return row;
  });

export const listComingSoonSignups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { country_code?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("coming_soon_signups")
      .select("id,email,country_code,source,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.country_code) q = q.eq("country_code", data.country_code);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });
