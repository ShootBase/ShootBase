import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAdminCountry, applyCountryFilter, assertRowInScope } from "@/lib/admin/country.server";

export const adminListPortfolioVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    let q = context.supabase
      .from("portfolio_videos")
      .select(
        "id, country, professional_id, title, status, is_active, duration_seconds, size_bytes, playback_url, thumbnail_url, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    q = applyCountryFilter(q, scope);
    const { data: videos, error } = await q;
    if (error) throw new Error(error.message);

    const proIds = Array.from(new Set((videos ?? []).map((v: any) => v.professional_id)));
    const [{ data: pros }, { data: reports }] = await Promise.all([
      proIds.length
        ? context.supabase
            .from("professionals")
            .select("id, business_name")
            .in("id", proIds)
        : Promise.resolve({ data: [] }),
      context.supabase
        .from("portfolio_video_reports")
        .select("id, video_id, reason, notes, status, created_at"),
    ]);
    const proMap = new Map((pros ?? []).map((p: any) => [p.id, p.business_name]));
    const reportMap = new Map<string, any[]>();
    for (const r of reports ?? []) {
      const arr = reportMap.get((r as any).video_id) ?? [];
      arr.push(r);
      reportMap.set((r as any).video_id, arr);
    }
    return {
      country: scope.country,
      videos: (videos ?? []).map((v: any) => ({
        ...v,
        business_name: proMap.get(v.professional_id) ?? "—",
        reports: reportMap.get(v.id) ?? [],
      })),
    };
  });

export const adminRemovePortfolioVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const scope = await resolveAdminCountry(context.supabase, context.userId);
    const { data: row } = await context.supabase
      .from("portfolio_videos")
      .select("id, country, provider_asset_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("not_found");
    assertRowInScope(scope, (row as any).country);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      await supabaseAdmin.storage
        .from("portfolio-videos")
        .remove([(row as any).provider_asset_id]);
    } catch {/* ignore */}
    const { error } = await context.supabase
      .from("portfolio_videos")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    // mark related reports resolved
    await context.supabase
      .from("portfolio_video_reports")
      .update({ status: "actioned" })
      .eq("video_id", data.id);
    return { ok: true as const };
  });

export const adminDismissVideoReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ report_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await resolveAdminCountry(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("portfolio_video_reports")
      .update({ status: "dismissed" })
      .eq("id", data.report_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
