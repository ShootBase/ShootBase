import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export type PublicReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  project_category: string | null;
  would_recommend: boolean;
  created_at: string;
  reviewer_first_name: string | null;
  reviewer_verified: boolean;
  reply_body: string | null;
  reply_created_at: string | null;
  reply_business_name: string | null;
  reply_avatar_path: string | null;
};

export type ReviewStats = {
  total: number;
  avg_rating: number;
  recommend_pct: number;
  c1: number; c2: number; c3: number; c4: number; c5: number;
};

const proIdSchema = z.object({ pro_id: z.string().uuid() });

export const getProReviews = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => proIdSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const [{ data: reviews, error: e1 }, { data: stats, error: e2 }] = await Promise.all([
      (sb as any).rpc("get_pro_reviews", { _pro_id: data.pro_id }),
      (sb as any).rpc("get_pro_review_stats", { _pro_id: data.pro_id }),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    return {
      reviews: (reviews ?? []) as PublicReview[],
      stats: (stats?.[0] ?? { total: 0, avg_rating: 0, recommend_pct: 0, c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 }) as ReviewStats,
    };
  });

const eligSchema = z.object({ pro_id: z.string().uuid(), job_id: z.string().uuid() });

export const canReviewPro = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => eligSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .rpc("can_review_pro", { _pro_id: data.pro_id, _job_id: data.job_id });
    if (error) throw new Error(error.message);
    const row = rows?.[0] ?? { eligible: false, reason: "unknown", quote_request_id: null };
    return row as { eligible: boolean; reason: string; quote_request_id: string | null };
  });

const submitSchema = z.object({
  pro_id: z.string().uuid(),
  job_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional().default(""),
  body: z.string().max(4000).optional().default(""),
  project_category: z.string().max(80).optional().default(""),
  would_recommend: z.boolean().optional().default(true),
});

export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context.supabase as any).rpc("submit_pro_review", {
      _pro_id: data.pro_id, _job_id: data.job_id, _rating: data.rating,
      _title: data.title, _body: data.body,
      _project_category: data.project_category, _would_recommend: data.would_recommend,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

const replySchema = z.object({ review_id: z.string().uuid(), body: z.string().min(1).max(2000) });
export const replyToReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => replySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context.supabase as any).rpc("reply_to_review", {
      _review_id: data.review_id, _body: data.body,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

const reportSchema = z.object({
  target_type: z.enum(["review", "reply"]),
  target_id: z.string().uuid(),
  reason: z.string().max(500).optional().default(""),
});
export const reportTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reportSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("report_review_target", {
      _target_type: data.target_type, _target_id: data.target_id, _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const modSchema = z.object({
  review_id: z.string().uuid(),
  action: z.enum(["hide", "remove", "restore"]),
  reason: z.string().max(500).optional().default(""),
});
export const adminModerateReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => modSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("admin_moderate_review", {
      _review_id: data.review_id, _action: data.action, _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Viewer-aware contact reveal (only returns data when caller has unlocked a lead from this pro)
export const getProContactInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => proIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .rpc("get_pro_contact_info", { _pro_id: data.pro_id });
    if (error) throw new Error(error.message);
    return (rows?.[0] ?? null) as null | {
      website: string | null; instagram: string | null; facebook: string | null;
      tiktok: string | null; linkedin: string | null; twitter: string | null; youtube: string | null;
    };
  });
