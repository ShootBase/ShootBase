import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProCandidate = {
  professional_id: string;
  business_name: string | null;
  slug: string | null;
  avatar_path: string | null;
  city: string | null;
  qr_id: string | null;
  source: "unlocked" | "messaged" | "invited";
};

export const proCandidatesForJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("pro_candidates_for_job" as never, {
      _job_id: data.job_id,
    } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ProCandidate[];
  });

const closeSchema = z.object({
  job_id: z.string().uuid(),
  reason: z.enum(["hired", "no_longer_needed", "decided_not_to_proceed", "posted_by_mistake", "other"]),
  hired_through: z.enum(["shootbase", "outside"]).optional().nullable(),
  hired_pro_id: z.string().uuid().optional().nullable(),
  outside_source: z.string().max(60).optional().nullable(),
});

export const closeJobWithOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => closeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("close_job_with_outcome" as never, {
      _job_id: data.job_id,
      _reason: data.reason,
      _hired_through: data.hired_through ?? null,
      _hired_pro_id: data.hired_pro_id ?? null,
      _outside_source: data.outside_source ?? null,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row as { job_id: string; hired_qr_id: string | null };
  });

export type JobOutcomeStats = {
  total_posted: number;
  total_closed: number;
  hires_shootbase: number;
  hires_outside: number;
  conversion_pct: number;
};

export const myJobOutcomeStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("my_job_outcome_stats" as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return (row as JobOutcomeStats | null) ?? {
      total_posted: 0, total_closed: 0, hires_shootbase: 0, hires_outside: 0, conversion_pct: 0,
    };
  });
