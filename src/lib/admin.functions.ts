import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _uid: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const isAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("is_staff", {
      _uid: context.userId,
    });
    return { isAdmin: !!data };
  });

export const getAdminSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("credit_settings")
      .select("unlock_cost, welcome_bonus, lead_expiry_days, priority_radius_miles, updated_at")
      .eq("id", 1)
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

const updateSchema = z.object({
  unlock_cost: z.number().int().min(1).max(1000),
  welcome_bonus: z.number().int().min(0).max(1000),
  lead_expiry_days: z.number().int().min(1).max(365),
  priority_radius_miles: z.number().int().min(5).max(500),
});

export const updateAdminSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("credit_settings")
      .update({
        unlock_cost: data.unlock_cost,
        welcome_bonus: data.welcome_bonus,
        lead_expiry_days: data.lead_expiry_days,
        priority_radius_miles: data.priority_radius_miles,
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

