import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RequestableJob = {
  id: string;
  title: string;
  city: string | null;
  event_date: string | null;
  status: string;
  service_name: string | null;
  already_requested: boolean;
};

export const getRequestableJobsForPro = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ professional_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, title, city, event_date, status, service:services(name)" as never)
      .eq("customer_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = ((jobs ?? []) as unknown) as Array<{
      id: string; title: string; city: string | null; event_date: string | null; status: string;
      service: { name: string } | null;
    }>;
    const ids = list.map((j) => j.id);
    let requested = new Set<string>();
    if (ids.length) {
      const { data: reqs } = await supabase
        .from("pro_contact_requests")
        .select("job_id")
        .eq("professional_id", data.professional_id)
        .in("job_id", ids);
      requested = new Set((reqs ?? []).map((r: { job_id: string }) => r.job_id));
    }
    return list.map((j) => ({
      id: j.id,
      title: j.title,
      city: j.city,
      event_date: j.event_date,
      status: j.status,
      service_name: j.service?.name ?? null,
      already_requested: requested.has(j.id),
    })) as RequestableJob[];
  });

export type SuggestedPro = {
  professional_id: string;
  slug: string;
  business_name: string | null;
  city: string | null;
  about: string | null;
  is_verified: boolean;
  avatar_path: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  distance_miles: number | null;
  service_name: string | null;
  response_rate_pct: number | null;
  avg_response_minutes: number | null;
  successful_intros: number;
  profile_completeness_pct: number;
  already_invited: boolean;
};

const jobIdSchema = z.object({ job_id: z.string().uuid() });

export const suggestProsForJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => jobIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("suggest_pros_for_job" as never, {
      _job_id: data.job_id,
    } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as SuggestedPro[];
  });

export const requestProContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ job_id: z.string().uuid(), professional_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("request_pro_contact" as never, {
      _job_id: data.job_id,
      _professional_id: data.professional_id,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row as { id: string; status: string; created_at: string; was_new: boolean };
  });

export const myRequestedProIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("pro_contact_requests")
      .select("professional_id")
      .eq("customer_id", context.userId);
    if (error) throw new Error(error.message);
    return Array.from(new Set((data ?? []).map((r: { professional_id: string }) => r.professional_id)));
  });

export const markContactRequestViewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => jobIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("mark_contact_request_viewed" as never, {
      _job_id: data.job_id,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type ClientContactRequest = {
  id: string;
  job_id: string;
  status: "pending" | "viewed" | "unlocked" | "responded";
  created_at: string;
  viewed_at: string | null;
  unlocked_at: string | null;
  responded_at: string | null;
  title: string;
  city: string;
  event_date: string | null;
  budget_band: string | null;
  service_name: string | null;
  unlocked: boolean;
};

export const myClientContactRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("my_client_contact_requests" as never);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ClientContactRequest[];
  });

export type InvitedPro = {
  id: string;
  professional_id: string;
  slug: string;
  business_name: string | null;
  city: string | null;
  avatar_path: string | null;
  is_verified: boolean;
  status: "pending" | "viewed" | "unlocked" | "responded";
  created_at: string;
  viewed_at: string | null;
  unlocked_at: string | null;
  responded_at: string | null;
};

export const myInvitedPros = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => jobIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("my_invited_pros" as never, {
      _job_id: data.job_id,
    } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as InvitedPro[];
  });
