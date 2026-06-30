import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_VIDEOS = 2;
const MAX_DURATION = 180; // 3 minutes
const MAX_SIZE = 100 * 1024 * 1024;

async function getMyPro(supabase: any, userId: string) {
  const { data } = await supabase
    .from("professionals")
    .select("id, country")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("No professional profile");
  return data as { id: string; country: string };
}

async function assertEligible(supabase: any, proId: string) {
  const { data, error } = await supabase.rpc("professional_has_video_services" as never, {
    _pro_id: proId,
  } as never);
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Add a video service to enable Portfolio Videos");
}

export const getMyPortfolioVideosContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: pro } = await context.supabase
      .from("professionals")
      .select("id, country")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!pro) return { eligible: false, videos: [], slotsLeft: 0, max: MAX_VIDEOS };
    const { data: eligible } = await context.supabase.rpc(
      "professional_has_video_services" as never,
      { _pro_id: (pro as any).id } as never,
    );
    if (!eligible) return { eligible: false, videos: [], slotsLeft: 0, max: MAX_VIDEOS };
    const { data: videos } = await context.supabase
      .from("portfolio_videos")
      .select(
        "id, playback_url, thumbnail_url, duration_seconds, size_bytes, title, status, position, is_active, created_at",
      )
      .eq("professional_id", (pro as any).id)
      .order("position", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    const active = (videos ?? []).filter((v: any) => v.is_active);
    return {
      eligible: true,
      videos: videos ?? [],
      slotsLeft: Math.max(0, MAX_VIDEOS - active.length),
      max: MAX_VIDEOS,
    };
  });

const createSchema = z.object({
  storage_path: z.string().min(1),
  duration_seconds: z.number().int().positive().max(MAX_DURATION),
  size_bytes: z.number().int().positive().max(MAX_SIZE),
  width: z.number().int().positive().max(1920).optional(),
  height: z.number().int().positive().max(1920).optional(),
  title: z.string().trim().max(120).optional(),
});

export const createPortfolioVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const pro = await getMyPro(context.supabase, context.userId);
    await assertEligible(context.supabase, pro.id);

    // slot check
    const { count } = await context.supabase
      .from("portfolio_videos")
      .select("id", { count: "exact", head: true })
      .eq("professional_id", pro.id)
      .eq("is_active", true);
    if ((count ?? 0) >= MAX_VIDEOS) {
      throw new Error(`Maximum ${MAX_VIDEOS} videos`);
    }

    // Signed URL for playback (long-lived 7 days; auto refreshed by UI on next list)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage
      .from("portfolio-videos")
      .createSignedUrl(data.storage_path, 60 * 60 * 24 * 7);

    const { data: row, error } = await context.supabase
      .from("portfolio_videos")
      .insert({
        professional_id: pro.id,
        country: pro.country,
        provider: "supabase",
        provider_asset_id: data.storage_path,
        playback_url: signed?.signedUrl ?? "",
        thumbnail_url: null,
        duration_seconds: data.duration_seconds,
        size_bytes: data.size_bytes,
        width: data.width ?? null,
        height: data.height ?? null,
        title: data.title ?? null,
        status: "ready",
        position: (count ?? 0) + 1,
        is_active: true,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: (row as any).id };
  });

export const deletePortfolioVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const pro = await getMyPro(context.supabase, context.userId);
    const { data: row } = await context.supabase
      .from("portfolio_videos")
      .select("id, provider_asset_id, professional_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || (row as any).professional_id !== pro.id) throw new Error("not_found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      await supabaseAdmin.storage.from("portfolio-videos").remove([(row as any).provider_asset_id]);
    } catch {/* ignore */}
    const { error } = await context.supabase.from("portfolio_videos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const reorderPortfolioVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(MAX_VIDEOS) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const pro = await getMyPro(context.supabase, context.userId);
    for (let i = 0; i < data.ids.length; i++) {
      await context.supabase
        .from("portfolio_videos")
        .update({ position: i + 1 })
        .eq("id", data.ids[i])
        .eq("professional_id", pro.id);
    }
    return { ok: true as const };
  });

// ---------- Public profile ----------
export const listPublicPortfolioVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ professional_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase.rpc(
      "list_public_portfolio_videos" as never,
      { _pro_id: data.professional_id } as never,
    );
    return { videos: (rows ?? []) as any[] };
  });

// ---------- Reporting ----------
const reportSchema = z.object({
  video_id: z.string().uuid(),
  reason: z.enum(["inappropriate", "copyright", "spam", "wrong_category", "other"]),
  notes: z.string().trim().max(500).optional(),
});

export const reportPortfolioVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reportSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("portfolio_video_reports").insert({
      video_id: data.video_id,
      reporter_user_id: context.userId,
      reason: data.reason,
      notes: data.notes ?? null,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
