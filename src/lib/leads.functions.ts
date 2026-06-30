import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const postLeadSchema = z.object({
  service_id: z.string().uuid(),
  kind: z.enum(["photography", "videography"]),
  title: z.string().min(3).max(120),
  city: z.string().min(1).max(80),
  event_date: z.string().optional().or(z.literal("")),
  event_time: z.string().optional().or(z.literal("")),
  flexible_dates: z.boolean().optional(),
  duration: z.string().max(40).optional().or(z.literal("")),
  duration_days: z.number().int().positive().max(365).optional().nullable(),
  duration_start_date: z.string().optional().or(z.literal("")),
  duration_end_date: z.string().optional().or(z.literal("")),
  duration_consecutive: z.boolean().optional(),
  duration_flexible: z.boolean().optional(),
  budget_band: z.string().max(40).optional().or(z.literal("")),
  details: z.string().min(10).max(2000),
  contact_name: z.string().max(120).optional().or(z.literal("")),
  contact_phone: z.string().max(40).optional().or(z.literal("")),
  preferred_contact: z.enum(["email", "phone", "either"]).optional().or(z.literal("")),
  inspiration_links: z.array(z.string().url()).max(5).optional(),
  event_type: z.string().max(40).optional().or(z.literal("")),
  urgency: z.string().max(20).optional().or(z.literal("")),
  client_display_name: z.string().max(120).optional().or(z.literal("")),
  show_name_to_pros: z.boolean().optional(),
  remote_ok: z.boolean().optional(),
  postcode: z.string().max(20).optional().or(z.literal("")),
  allow_extra_pros: z.boolean().optional(),
});

export const postLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => postLeadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    // Gate: clients must verify BOTH their email and phone number before
    // posting a job. OAuth (google/apple) provider sign-ins are treated as
    // email-verified. Re-checked server-side so the UI cannot be bypassed.
    const isOAuth = ((claims as { amr?: { method?: string }[] } | undefined)?.amr ?? [])
      .some((a) => a.method && a.method !== "password" && a.method !== "otp");
    const emailVerified = !!(claims as { email_verified?: boolean } | undefined)?.email_verified || isOAuth;
    const { data: prof } = await supabase
      .from("profiles")
      .select("verified_phone")
      .eq("id", userId)
      .maybeSingle();
    const phoneVerified = !!(prof as { verified_phone?: boolean } | null)?.verified_phone;
    if (!emailVerified || !phoneVerified) {
      const missing = [!emailVerified && "email", !phoneVerified && "phone"].filter(Boolean).join("+");
      // Return a structured result instead of throwing so this expected
      // pre-condition does not surface as an unhandled server-fn error.
      return { verification_required: missing } as const;
    }

    const summary = data.details.slice(0, 160);

    // Geocode the lead location so the matching trigger can apply
    // distance-based filtering. Failure is non-fatal — the trigger
    // will then only match nationwide / remote-eligible pros.
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const { geocodeUk } = await import("@/lib/geocode.server");
      const hit = await geocodeUk(data.postcode, data.city);
      if (hit) { lat = hit.lat; lng = hit.lng; }
    } catch {
      /* non-blocking */
    }

    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        customer_id: userId,
        service_id: data.service_id,
        kind: data.kind,
        title: data.title,
        summary,
        details: data.details,
        city: data.city,
        event_date: data.event_date || null,
        event_time: data.event_time || null,
        flexible_dates: !!data.flexible_dates,
        duration: data.duration || null,
        duration_days: data.duration_days ?? null,
        duration_start_date: data.duration_start_date || null,
        duration_end_date: data.duration_end_date || null,
        duration_consecutive: data.duration_consecutive ?? null,
        duration_flexible: data.duration_flexible ?? null,
        budget_band: data.budget_band || null,
        contact_name: data.contact_name || null,
        contact_phone: data.contact_phone || null,
        preferred_contact: data.preferred_contact || null,
        inspiration_links: data.inspiration_links ?? [],
        event_type: data.event_type || null,
        urgency: data.urgency || null,
        client_display_name: data.client_display_name || data.contact_name || null,
        show_name_to_pros: data.show_name_to_pros ?? true,
        remote_ok: data.remote_ok ?? false,
        latitude: lat,
        longitude: lng,
        allow_extra_pros: data.allow_extra_pros ?? false,
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Post-publish notifications. All non-blocking — never fail the post on
    // email/bell errors. Only runs after the row is committed, so nothing
    // upstream (auth, verification, draft save) ever sends these emails.
    try {
      const email = typeof (claims as { email?: string } | undefined)?.email === 'string'
        ? ((claims as { email?: string }).email as string)
        : null;
      const clientName = (data.contact_name && data.contact_name.trim())
        || ((claims as { user_metadata?: { full_name?: string } } | undefined)?.user_metadata?.full_name ?? null);
      const jobId = (job as { id: string }).id;
      const jobTitle = (job as { title: string }).title;

      const { sendJobPostedConfirmation } = await import('@/lib/job-posted-email.server');
      await sendJobPostedConfirmation({
        jobId,
        jobTitle,
        clientName: clientName ?? null,
        clientEmail: email,
      });

      const { notifyAdmins } = await import('@/lib/admin-notify.server');
      await notifyAdmins({
        type: 'other',
        title: 'New job posted',
        message: `${clientName ?? 'A client'} posted a new job: ${jobTitle}`,
        link: `/admin`,
        refId: jobId,
        userId,
        userName: clientName ?? null,
        userEmail: email,
        userRole: 'customer',
        relatedJobId: jobId,
        relatedJobTitle: jobTitle,
        category: data.event_type || data.kind,
        metadata: {
          city: data.city,
          budget_band: data.budget_band || null,
          contact_phone: data.contact_phone || null,
          posted_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.warn('[postLead] post-publish notifications failed', err);
    }

    return job;
  });

const attachSchema = z.object({
  job_id: z.string().uuid(),
  files: z.array(z.object({
    storage_path: z.string().min(1),
    mime_type: z.string().max(120).optional(),
    size_bytes: z.number().int().nonnegative().optional(),
  })).max(5),
});

export const attachInspiration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => attachSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: job } = await supabase.from("jobs").select("id").eq("id", data.job_id).eq("customer_id", userId).maybeSingle();
    if (!job) throw new Error("Job not found");
    if (data.files.length === 0) return { ok: true };
    const { error } = await supabase.from("job_attachments").insert(
      data.files.map((f) => ({ job_id: data.job_id, storage_path: f.storage_path, mime_type: f.mime_type ?? null, size_bytes: f.size_bytes ?? null })),
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const myPostedLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("jobs")
      .select(
        "id, title, city, event_date, event_time, duration, duration_days, duration_start_date, duration_end_date, status, expires_at, created_at, kind, budget_band, urgency, client_display_name, show_name_to_pros, service:services(name)" as any,
      )
      .eq("customer_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const jobs = (data ?? []) as any[];
    const ids = jobs.map((j) => j.id);
    let counts: Record<string, { responses: number; last_activity: string | null }> = {};
    let unlocks: Record<string, number> = {};
    if (ids.length) {
      const { data: qrs } = await supabase
        .from("quote_requests")
        .select("job_id, last_message_at, created_at")
        .in("job_id", ids);
      for (const qr of (qrs ?? []) as any[]) {
        const k = qr.job_id as string;
        if (!counts[k]) counts[k] = { responses: 0, last_activity: null };
        counts[k].responses += 1;
        const t = (qr.last_message_at as string | null) ?? (qr.created_at as string | null);
        if (t && (!counts[k].last_activity || t > counts[k].last_activity!)) counts[k].last_activity = t;
      }
      const { data: us } = await supabase
        .from("lead_unlocks")
        .select("job_id")
        .in("job_id", ids);
      for (const u of (us ?? []) as any[]) {
        const k = u.job_id as string;
        unlocks[k] = (unlocks[k] ?? 0) + 1;
      }
    }
    return jobs.map((j) => ({
      ...j,
      response_count: counts[j.id]?.responses ?? 0,
      unlock_count: unlocks[j.id] ?? 0,
      last_activity: counts[j.id]?.last_activity ?? null,
    }));
  });


export const getMyJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // contact_name / contact_phone are column-level revoked on public.jobs, so
    // we must read the row through a SECURITY DEFINER RPC that enforces
    // customer ownership instead of selecting from the table directly.
    const { data: job, error } = await supabase.rpc("get_my_job" as never, { _job_id: data.job_id } as never);
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job not found");
    return job as any;
  });


const jobIdSchema = z.object({ job_id: z.string().uuid() });


async function updateOwnedJob(
  supabase: any,
  userId: string,
  jobId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabase.from("jobs").update(patch).eq("id", jobId).eq("customer_id", userId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export const pauseJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => jobIdSchema.parse(d))
  .handler(async ({ data, context }) => updateOwnedJob(context.supabase, context.userId, data.job_id, { status: "paused" }));

export const closeJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => jobIdSchema.parse(d))
  .handler(async ({ data, context }) => updateOwnedJob(context.supabase, context.userId, data.job_id, { status: "closed" }));

export const repostJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => jobIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const newExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    return updateOwnedJob(context.supabase, context.userId, data.job_id, { status: "open", expires_at: newExpiry });
  });

const browseSchema = z.object({
  serviceId: z.string().uuid().optional(),
  kind: z.enum(["photography", "videography"]).optional(),
  city: z.string().optional(),
});

export type MarketplaceLead = {
  id: string;
  title: string;
  summary: string;
  details: string;
  city: string;
  postcode_prefix: string | null;
  event_date: string | null;
  event_time: string | null;
  budget_band: string | null;
  duration: string | null;
  duration_days: number | null;
  duration_hours: number | null;
  flexible_dates: boolean;
  inspiration_links: string[] | null;
  expires_at: string;
  created_at: string;
  status: string;
  kind: string;
  service_name: string | null;
  event_type: string | null;
  urgency: string | null;
  unlock_credit_cost: number;
  urgency_status: string;
  max_responses: number;
  latitude: number | null;
  longitude: number | null;
  response_count: number;
  unlocked: boolean;
  client_display_name: string | null;
  customer_first_name: string | null;
  customer_verified_phone: boolean;
  customer_verified: boolean;
  customer_frequent_user: boolean;
  customer_account_age_days: number;
  customer_previous_requests: number;
  masked_contact_email: string | null;
  masked_contact_phone: string | null;
  customer_member_since: string | null;
  allow_extra_pros?: boolean;
  distance_miles: number | null;
  priority_radius_miles: number;
};


export const browseLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => browseSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", userId).maybeSingle();
    if (!pro) return { hasProfile: false as const, leads: [] as MarketplaceLead[] };

    const { data: rows, error } = await supabase.rpc("browse_marketplace_leads" as never);
    if (error) throw new Error(error.message);

    let leads = ((rows ?? []) as unknown as MarketplaceLead[]).filter((l) => {
      if (data.kind && l.kind !== data.kind) return false;
      if (data.city && !l.city.toLowerCase().includes(data.city.toLowerCase())) return false;
      return true;
    });
    if (data.serviceId) {
      const { data: svc } = await supabase.from("services").select("id, name").eq("id", data.serviceId).maybeSingle();
      const name = svc?.name;
      if (name) leads = leads.filter((l) => l.service_name === name);
    }

    // Composite ranking — primary order comes from the SQL function
    // (distance band → urgency → freshness). Re-rank only within the same
    // distance band so closer leads always stay above further leads, while
    // budget quality / verification act as tie-breakers.
    const now = Date.now();
    const distanceBand = (l: MarketplaceLead): number => {
      const d = l.distance_miles;
      const prio = l.priority_radius_miles ?? 50;
      if (d == null) return 5;
      if (d <= 10) return 1;
      if (d <= 25) return 2;
      if (d <= prio) return 3;
      return 4;
    };
    const budgetValue = (band: string | null): number | null => {
      switch (band) {
        case "under-200": return 150;
        case "200-500": return 350;
        case "500-1000": return 750;
        case "1000-2500": return 1750;
        case "2500+": return 3000;
        default: return null;
      }
    };
    const qualityScore = (band: string | null): number => {
      const v = budgetValue(band);
      if (v == null) return 0;
      if (v > 500) return 3;
      if (v >= 200) return 2;
      return 1;
    };
    const freshScore = (iso: string): number => {
      const mins = (now - new Date(iso).getTime()) / 60000;
      if (mins <= 30) return 4;
      if (mins <= 180) return 3;
      if (mins <= 1440) return 2;
      return 0;
    };
    leads.sort((a, b) => {
      const bandDiff = distanceBand(a) - distanceBand(b);
      if (bandDiff !== 0) return bandDiff;
      const score = (l: MarketplaceLead) =>
        qualityScore(l.budget_band) +
        freshScore(l.created_at) +
        (l.customer_verified_phone ? 2 : 0) +
        (l.customer_verified ? 1 : 0);
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });


    return { hasProfile: true as const, leads };
  });

export const unlockLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { requireProVerified } = await import("@/lib/pro-verification.functions");
    try {
      await requireProVerified(supabase as never, context.userId, context.claims as never);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.startsWith("PRO_VERIFICATION_REQUIRED")) {
        return { ok: false as const, error: msg };
      }
      throw e;
    }
    const { data: rows, error } = await supabase.rpc("unlock_job", { _job_id: data.job_id });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("INSUFFICIENT_CREDITS")) return { ok: false as const, error: "INSUFFICIENT_CREDITS" };
      if (msg.includes("LEAD_EXPIRED")) return { ok: false as const, error: "LEAD_EXPIRED" };
      if (msg.includes("LEAD_FULL")) return { ok: false as const, error: "LEAD_FULL" };
      if (msg.includes("NOT_MATCHED")) return { ok: false as const, error: "NOT_MATCHED" };
      throw new Error(msg);
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { ok: true as const, lead: row };
  });

export const myUnlockedLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("my_unlocked_leads");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      unlock_id: string;
      job_id: string;
      unlocked_at: string;
      credits_used: number;
      title: string;
      city: string;
      event_date: string | null;
      event_time: string | null;
      budget_band: string | null;
      details: string;
      customer_name: string | null;
      customer_email: string | null;
      customer_phone: string | null;
      customer_verified_phone: boolean;
    }>;
    // Attach quote_request_id so the UI can deep-link straight to the
    // conversation. RLS scopes quote_requests to the caller's pro row.
    if (rows.length === 0) return rows.map((r) => ({ ...r, quote_request_id: null as string | null }));
    const jobIds = Array.from(new Set(rows.map((r) => r.job_id)));
    const { data: qrs } = await context.supabase
      .from("quote_requests")
      .select("id, job_id")
      .in("job_id", jobIds);
    const byJob = new Map<string, string>();
    for (const q of qrs ?? []) if (q.job_id && !byJob.has(q.job_id as string)) byJob.set(q.job_id as string, q.id as string);
    return rows.map((r) => ({ ...r, quote_request_id: byJob.get(r.job_id) ?? null }));
  });
