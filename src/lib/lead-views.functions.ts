import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getProId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from("professionals").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

// ---------- Mark as read ----------
export const markLeadViewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const proId = await getProId(context.supabase, context.userId);
    if (!proId) return { ok: false as const };
    await context.supabase
      .from("pro_lead_views")
      .upsert({ professional_id: proId, job_id: data.job_id, viewed_at: new Date().toISOString() });
    return { ok: true as const };
  });

export const listViewedLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const proId = await getProId(context.supabase, context.userId);
    if (!proId) return [] as string[];
    const { data } = await context.supabase
      .from("pro_lead_views")
      .select("job_id")
      .eq("professional_id", proId);
    return (data ?? []).map((r: any) => r.job_id as string);
  });

// ---------- Favourites ----------
export const toggleLeadFavourite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid(), starred: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const proId = await getProId(context.supabase, context.userId);
    if (!proId) throw new Error("No professional profile");
    if (data.starred) {
      await context.supabase
        .from("pro_lead_favourites")
        .upsert({ professional_id: proId, job_id: data.job_id });
    } else {
      await context.supabase
        .from("pro_lead_favourites")
        .delete()
        .eq("professional_id", proId)
        .eq("job_id", data.job_id);
    }
    return { ok: true as const };
  });

export const listFavouriteLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const proId = await getProId(context.supabase, context.userId);
    if (!proId) return [] as string[];
    const { data } = await context.supabase
      .from("pro_lead_favourites")
      .select("job_id")
      .eq("professional_id", proId);
    return (data ?? []).map((r: any) => r.job_id as string);
  });

// ---------- Dismissed ("Not interested") ----------
export const dismissLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const proId = await getProId(context.supabase, context.userId);
    if (!proId) throw new Error("No professional profile");
    await context.supabase
      .from("pro_lead_dismissals")
      .upsert({ professional_id: proId, job_id: data.job_id });
    return { ok: true as const };
  });

export const undismissLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const proId = await getProId(context.supabase, context.userId);
    if (!proId) throw new Error("No professional profile");
    await context.supabase
      .from("pro_lead_dismissals")
      .delete()
      .eq("professional_id", proId)
      .eq("job_id", data.job_id);
    return { ok: true as const };
  });

export const listDismissedLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const proId = await getProId(context.supabase, context.userId);
    if (!proId) return [] as string[];
    const { data } = await context.supabase
      .from("pro_lead_dismissals")
      .select("job_id")
      .eq("professional_id", proId);
    return (data ?? []).map((r: any) => r.job_id as string);
  });

// ---------- Saved views ----------
const filterSchema = z.object({
  search: z.string().optional(),
  kind: z.string().optional(),
  city: z.string().optional(),
  service: z.string().optional(),
  date: z.string().optional(),
  budget: z.string().optional(),
  duration: z.string().optional(),
  urgency: z.string().optional(),
  tab: z.string().optional(),
}).passthrough();

export const listSavedViews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const proId = await getProId(context.supabase, context.userId);
    if (!proId) return [] as Array<{ id: string; name: string; filters: any }>;
    const { data } = await context.supabase
      .from("pro_saved_lead_views")
      .select("id, name, filters")
      .eq("professional_id", proId)
      .order("created_at", { ascending: false });
    return (data ?? []) as Array<{ id: string; name: string; filters: any }>;
  });

export const saveLeadView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(80), filters: filterSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const proId = await getProId(context.supabase, context.userId);
    if (!proId) throw new Error("No professional profile");
    const { data: row, error } = await context.supabase
      .from("pro_saved_lead_views")
      .insert({ professional_id: proId, name: data.name, filters: data.filters as any })
      .select("id, name, filters")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSavedView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const proId = await getProId(context.supabase, context.userId);
    if (!proId) throw new Error("No professional profile");
    await context.supabase
      .from("pro_saved_lead_views")
      .delete()
      .eq("id", data.id)
      .eq("professional_id", proId);
    return { ok: true as const };
  });
