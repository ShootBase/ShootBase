import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BUDGET_BANDS, slugify } from "@/lib/format";
import { detectBioContactInfo } from "@/lib/bio-contact-filter";
import { format } from "date-fns";

// publicClient is invoked inside server-fn handlers only; the createClient import
// itself is the supabase-js public API (no secrets), and process.env reads only happen
// when the handler is executed server-side.
function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

// ============ PUBLIC READS ============
export const listServices = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data, error } = await sb.from("services").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return data;
});

export const getRecentJobs = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ country: z.enum(["GB", "NG"]).optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
  const sb = publicClient();
  const cutoff = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  const code = data?.country ?? "GB";
  // DB stores the full country name ("United Kingdom" / "Nigeria"). Map the
  // ISO code coming from the client to the canonical value so filtering
  // actually matches rows — never trust client-supplied full names.
  const countryName = code === "NG" ? "Nigeria" : "United Kingdom";

  // Use admin client so we include both open and closed jobs (jobs_public view filters to open only)
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: jobs, error: jobsError } = await supabaseAdmin
    .from("jobs")
    .select("id, title, city, created_at, kind, service_id, country")
    .eq("country", countryName)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(6);
  if (jobsError) throw new Error(jobsError.message);

  const jobIds = (jobs ?? []).map((j) => j.id);
  const responseCounts: Record<string, number> = {};
  if (jobIds.length > 0) {
    const { data: qrs, error: qrErr } = await supabaseAdmin
      .from("quote_requests")
      .select("job_id")
      .in("job_id", jobIds);
    if (!qrErr && qrs) {
      for (const qr of qrs) {
        if (!qr.job_id) continue;
        responseCounts[qr.job_id] = (responseCounts[qr.job_id] ?? 0) + 1;
      }
    }
  }

  const { data: svcRows } = await sb.from("services").select("id, slug, kind, name");
  const serviceMap = new Map(svcRows?.map((s) => [s.id, s]) ?? []);

  return (jobs ?? []).map((j) => {
    const svc = j.service_id ? serviceMap.get(j.service_id) : undefined;
    const count = j.id ? (responseCounts[j.id] ?? 0) : 0;
    return {
      id: j.id ?? "",
      title: j.title,
      city: j.city,
      createdAt: j.created_at,
      kind: j.kind,
      serviceSlug: svc?.slug ?? "",
      serviceName: svc?.name ?? j.title,
      responseCount: count,
    };
  });
});


const browseSchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  serviceSlug: z.string().optional(),
  kind: z.enum(["photography", "videography"]).optional(),
  budget: z.string().optional(),
  minRating: z.number().optional(),
  country: z.enum(["GB", "NG"]).optional(),
});

export const browseProfessionals = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => browseSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const sb = publicClient();
    // Country isolation: never let GB callers see NG pros (or vice versa).
    const countryName = data.country === "NG" ? "Nigeria" : "United Kingdom";
    let q = sb
      .from("professionals")
      .select(
        "id, slug, business_name, city, country, cover_image_url, starting_price_pence, years_experience, rating_avg, rating_count, is_verified, website, instagram, facebook, tiktok, linkedin, twitter, youtube, professional_services!inner(service_id, services!inner(slug, kind, name)), portfolio_items(id, image_url, display_order)",
      )
      .eq("status", "active")
      .eq("country", countryName)
      .order("years_experience", { ascending: false, nullsFirst: false })
      .limit(48);


    if (data.city) q = q.ilike("city", `%${data.city}%`);
    if (data.q) q = q.ilike("business_name", `%${data.q}%`);
    if (data.minRating) q = q.gte("rating_avg", data.minRating);

    const budget = BUDGET_BANDS.find((b) => b.id === data.budget);
    if (budget) {
      q = q.gte("starting_price_pence", budget.min);
      if (budget.max) q = q.lte("starting_price_pence", budget.max);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let filtered = rows ?? [];
    if (data.serviceSlug) {
      filtered = filtered.filter((p) =>
        p.professional_services.some((ps) => ps.services?.slug === data.serviceSlug),
      );
    }
    if (data.kind) {
      filtered = filtered.filter((p) => p.professional_services.some((ps) => ps.services?.kind === data.kind));
    }
    return filtered;
  });

export const getFeaturedProfessionals = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ country: z.enum(["GB", "NG"]).optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
  const sb = publicClient();
  const countryName = data?.country === "NG" ? "Nigeria" : "United Kingdom";
  const { data: rows, error } = await sb
    .from("professionals")
    .select("id, slug, business_name, city, cover_image_url, starting_price_pence, years_experience, is_verified")
    .eq("status", "active")
    .eq("country", countryName)
    .order("years_experience", { ascending: false, nullsFirst: false })
    .limit(6);
  if (error) throw new Error(error.message);
  return rows ?? [];
});

export const getRecommendedProsForClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ country: z.enum(["GB", "NG"]).optional(), limit: z.number().int().min(1).max(24).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = publicClient();
    const countryName = data?.country === "NG" ? "Nigeria" : "United Kingdom";
    const { userId } = context;

    // Try to bias by the client's most recent job city + service.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: recentJob } = await supabaseAdmin
      .from("jobs")
      .select("city, service_id")
      .eq("customer_id", userId)
      .eq("country", countryName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const limit = data?.limit ?? 12;

    let q = sb
      .from("professionals")
      .select(
        "id, slug, business_name, city, country, avatar_path, avatar_kind, cover_image_url, rating_avg, rating_count, is_verified, status, profile_completeness_pct, professional_services(services(id, name, kind, slug))",
      )
      .eq("status", "active")
      .eq("country", countryName)
      .order("is_verified", { ascending: false, nullsFirst: false })
      .order("rating_avg", { ascending: false, nullsFirst: false })
      .order("rating_count", { ascending: false, nullsFirst: false })
      .order("profile_completeness_pct", { ascending: false, nullsFirst: false })
      .limit(limit * 2);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let list = rows ?? [];
    const targetCity = recentJob?.city?.toLowerCase().trim();
    if (targetCity) {
      list = [...list].sort((a, b) => {
        const ac = (a.city ?? "").toLowerCase().trim() === targetCity ? 1 : 0;
        const bc = (b.city ?? "").toLowerCase().trim() === targetCity ? 1 : 0;
        return bc - ac;
      });
    }
    if (recentJob?.service_id) {
      list = [...list].sort((a, b) => {
        const am = a.professional_services?.some((ps: any) => ps.services?.id === recentJob.service_id) ? 1 : 0;
        const bm = b.professional_services?.some((ps: any) => ps.services?.id === recentJob.service_id) ? 1 : 0;
        return bm - am;
      });
    }

    return list.slice(0, limit).map((p: any) => {
      const services = (p.professional_services ?? [])
        .map((ps: any) => ps.services)
        .filter(Boolean) as Array<{ name: string; kind: string }>;
      const primaryKind = services[0]?.kind ?? null;
      return {
        id: p.id as string,
        slug: p.slug as string,
        business_name: p.business_name as string,
        city: p.city as string | null,
        avatar_path: p.avatar_path as string | null,
        cover_image_url: p.cover_image_url as string | null,
        rating_avg: Number(p.rating_avg ?? 0),
        rating_count: Number(p.rating_count ?? 0),
        is_verified: !!p.is_verified,
        available: p.status === "active",
        profession:
          primaryKind === "videography" ? "Videographer" : primaryKind === "photography" ? "Photographer" : "Creative Pro",
        services: services.slice(0, 3).map((s) => s.name),
      };
    });
  });

const slugSchema = z.object({ slug: z.string(), country: z.enum(["GB", "NG"]).optional() });

export const getProBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => slugSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    // Privacy lockdown: website + socials are intentionally NOT selected here.
    // They are revealed via getProContactInfo (in reviews.functions) only after
    // the viewer has unlocked a lead from this pro (or owns the profile).
    const countryName = data.country === "NG" ? "Nigeria" : "United Kingdom";
    const { data: pro, error } = await sb
      .from("professionals")
      .select(
        "id, slug, business_name, about, city, country, years_experience, cover_image_url, logo_url, starting_price_pence, is_verified, status, rating_avg, rating_count, avatar_path, avatar_kind, service_radius_miles, nationwide_service, remote_service, created_at, response_rate_pct, avg_response_minutes, successful_intros, profile_completeness_pct, packages(*), portfolio_items(*), professional_services(services(*))",
      )
      .eq("slug", data.slug)
      .eq("status", "active")
      .eq("country", countryName)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pro) return null;
    return pro;
  });

// ============ AUTHENTICATED ============
const selectRoleSchema = z.object({ role: z.enum(["customer", "professional"]) });

export const setAccountType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => selectRoleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Role is LOCKED after initial assignment. If the profile already has an
    // account_type, never overwrite it — user actions (e.g. posting a job)
    // must not flip a professional into a customer or vice versa.
    const { data: existing } = await supabaseAdmin
      .from("profiles").select("account_type").eq("id", userId).maybeSingle();
    const currentType = existing?.account_type ?? null;
    if (currentType && currentType !== data.role) {
      return { ok: true, locked: true, role: currentType };
    }
    if (!currentType) {
      await supabaseAdmin.from("profiles").upsert({ id: userId, account_type: data.role });
    }
    // user_roles is additive (admins may grant a secondary role); insert is idempotent.
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role }).select();
    return { ok: true };
  });


export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const { data: proRows } = await supabase.rpc("get_my_professional");
    const row = proRows?.[0] as
      | {
          id: string;
          slug: string;
          business_name: string;
          contact_name: string | null;
          status: string;
          avatar_path: string | null;
          avatar_kind: string | null;
          logo_url: string | null;
          service_radius_miles?: number | null;
          nationwide_service?: boolean | null;
          remote_service?: boolean | null;
          service_area_updated_at?: string | null;
        }
      | undefined;
    const pro = row
      ? {
          id: row.id,
          slug: row.slug,
          business_name: row.business_name,
          contact_name: row.contact_name,
          status: row.status,
          avatar_path: row.avatar_path,
          avatar_kind: row.avatar_kind,
          logo_url: row.logo_url,
          service_radius_miles: row.service_radius_miles ?? 25,
          nationwide_service: row.nationwide_service ?? false,
          remote_service: row.remote_service ?? false,
          service_area_updated_at: row.service_area_updated_at ?? null,
        }
      : null;
    return { profile, roles: roles?.map((r) => r.role) ?? [], professional: pro };
  });

export const getMyProPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: proRows } = await supabase.rpc("get_my_professional");
    const pro = proRows?.[0];
    if (!pro) return null;
    const [{ data: services }, { data: portfolio }] = await Promise.all([
      supabase
        .from("professional_services")
        .select("services(name, kind)")
        .eq("professional_id", pro.id),
      supabase
        .from("portfolio_items")
        .select("id, image_url, caption")
        .eq("professional_id", pro.id)
        .order("created_at", { ascending: false })
        .limit(4),
    ]);
    return { ...pro, professional_services: services ?? [], portfolio: portfolio ?? [] };
  });

const upsertProSchema = z.object({
  business_name: z.string().min(2).max(80),
  contact_name: z.string().min(2).max(80),
  about: z
    .string()
    .max(2000)
    .optional()
    .refine((v) => !v || detectBioContactInfo(v) === null, {
      message:
        "Sharing personal contact details in your bio is not allowed. You need to unlock leads to contact clients.",
    }),
  city: z.string().min(1).max(80),
  postcode: z.string().max(20).optional(),
  years_experience: z.coerce.number().int().min(0).max(80).optional(),
  starting_price_pence: z.coerce.number().int().min(0).optional(),
  cover_image_url: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    z.string().url().optional(),
  ),
  logo_url: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    z.string().url().optional(),
  ),
  website: z.preprocess(
    (v) => {
      if (typeof v !== "string") return undefined;
      const t = v.trim();
      if (!t) return undefined;
      return /^https?:\/\//i.test(t) ? t : `https://${t}`;
    },
    z.string().url().optional(),
  ),
  instagram: z.string().max(255).optional().transform((v) => {
    if (!v) return v;
    // Accept username, @username, or full instagram URL → store cleaned handle
    const trimmed = v.trim();
    const urlMatch = trimmed.match(/instagram\.com\/([^/?#]+)/i);
    const handle = (urlMatch ? urlMatch[1] : trimmed).replace(/^@/, "").replace(/\/$/, "");
    return handle;
  }),
  facebook: z.string().max(255).optional(),
  tiktok: z.string().max(255).optional(),
  linkedin: z.string().max(255).optional(),
  twitter: z.string().max(255).optional(),
  youtube: z.string().max(255).optional(),
  service_ids: z.array(z.string().uuid()).default([]),
  service_radius_miles: z.coerce.number().int().min(0).max(500).optional(),
  nationwide_service: z.boolean().optional(),
  remote_service: z.boolean().optional(),
}).superRefine((d, ctx) => {
  if (!d.nationwide_service && !d.remote_service) {
    if (d.service_radius_miles === undefined || d.service_radius_miles < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["service_radius_miles"],
        message: "Choose a travel radius of at least 1 mile, or select Nationwide.",
      });
    }
  }
});

export const upsertMyProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertProSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const baseSlug = slugify(data.business_name) || `pro-${userId.slice(0, 6)}`;
    // postcode is not in the public column grants on professionals; fetch the
    // owner-only fields server-side via supabaseAdmin (userId already verified by middleware).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("professionals")
      .select("id, slug, city, postcode, latitude, longitude")
      .eq("user_id", userId)
      .maybeSingle();

    let slug = existing?.slug ?? baseSlug;
    if (!existing) {
      // ensure unique slug
      let i = 0;
      while (true) {
        const candidate = i === 0 ? baseSlug : `${baseSlug}-${i}`;
        const { data: clash } = await supabase
          .from("professionals")
          .select("id")
          .eq("slug", candidate)
          .maybeSingle();
        if (!clash) {
          slug = candidate;
          break;
        }
        i++;
      }
    }

    // Geocode if the location or service-area changed.
    let lat: number | null = (existing as { latitude?: number | null } | null)?.latitude ?? null;
    let lng: number | null = (existing as { longitude?: number | null } | null)?.longitude ?? null;
    const cityChanged =
      !existing || (existing as { city?: string | null }).city !== data.city;
    const postcodeChanged =
      !existing || (existing as { postcode?: string | null }).postcode !== (data.postcode ?? null);
    if (cityChanged || postcodeChanged || lat == null || lng == null) {
      const { geocodeUk } = await import("@/lib/geocode.server");
      const hit = await geocodeUk(data.postcode, data.city);
      if (hit) {
        lat = hit.lat;
        lng = hit.lng;
      }
    }

    const serviceAreaTouched =
      data.service_radius_miles !== undefined ||
      data.nationwide_service !== undefined ||
      data.remote_service !== undefined ||
      cityChanged ||
      postcodeChanged;

    const payload = {
      user_id: userId,
      slug,
      business_name: data.business_name,
      contact_name: data.contact_name,
      about: data.about ?? null,
      city: data.city,
      postcode: data.postcode ?? null,
      years_experience: data.years_experience ?? null,
      starting_price_pence: data.starting_price_pence ?? null,
      cover_image_url: data.cover_image_url || null,
      logo_url: data.logo_url || null,
      website: data.website || null,
      instagram: data.instagram ?? null,
      facebook: data.facebook ?? null,
      tiktok: data.tiktok ?? null,
      linkedin: data.linkedin ?? null,
      twitter: data.twitter ?? null,
      youtube: data.youtube ?? null,
      status: "active" as const,
      service_radius_miles: data.nationwide_service ? 0 : (data.service_radius_miles ?? 25),
      nationwide_service: data.nationwide_service ?? false,
      remote_service: data.remote_service ?? false,
      latitude: lat,
      longitude: lng,
      ...(serviceAreaTouched ? { service_area_updated_at: new Date().toISOString() } : {}),
    };

    const { data: pro, error } = existing
      ? await supabase.from("professionals").update(payload).eq("id", existing.id).select("id").single()
      : await supabase.from("professionals").insert(payload).select("id").single();
    if (error) throw new Error(error.message);

    // sync services
    await supabase.from("professional_services").delete().eq("professional_id", pro.id);
    if (data.service_ids.length) {
      await supabase
        .from("professional_services")
        .insert(data.service_ids.map((sid) => ({ professional_id: pro.id, service_id: sid })));
    }
    return pro;
  });

const portfolioSchema = z.object({
  image_url: z.string().url(),
  caption: z.string().max(200).optional(),
});

export const addPortfolioItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => portfolioSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", userId).maybeSingle();
    if (!pro) throw new Error("Create your professional profile first");
    const { error } = await supabase.from("portfolio_items").insert({
      professional_id: pro.id,
      image_url: data.image_url,
      caption: data.caption ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePortfolioItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("portfolio_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ AVATAR ============
const avatarSchema = z.object({
  avatar_path: z.string().min(1),
  avatar_kind: z.enum(["logo", "photo"]),
});

export const setMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => avatarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.avatar_path.startsWith(`${userId}/`)) throw new Error("Invalid path");
    let { data: pro } = await supabase.from("professionals").select("id, avatar_path").eq("user_id", userId).maybeSingle();
    if (!pro) {
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      const businessName = (profile?.full_name as string | undefined)?.trim() || "My business";
      const baseSlug = slugify(businessName) || `pro-${userId.slice(0, 6)}`;
      let slug = baseSlug;
      for (let i = 0; i < 5; i++) {
        const candidate = i === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
        const { data: clash } = await supabase.from("professionals").select("id").eq("slug", candidate).maybeSingle();
        if (!clash) { slug = candidate; break; }
      }
      const { data: created, error: createErr } = await supabase
        .from("professionals")
        .insert({ user_id: userId, business_name: businessName, contact_name: profile?.full_name ?? null, slug })
        .select("id, avatar_path")
        .single();
      if (createErr) throw new Error(createErr.message);
      pro = created;
    }
    if (pro.avatar_path && pro.avatar_path !== data.avatar_path) {
      await supabase.storage.from("professional-avatars").remove([pro.avatar_path]);
    }
    const { error } = await supabase.from("professionals")
      .update({ avatar_path: data.avatar_path, avatar_kind: data.avatar_kind })
      .eq("id", pro.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase.from("professionals").select("id, avatar_path").eq("user_id", userId).maybeSingle();
    if (!pro) return { ok: true };
    if (pro.avatar_path) {
      await supabase.storage.from("professional-avatars").remove([pro.avatar_path]);
    }
    await supabase.from("professionals").update({ avatar_path: null, avatar_kind: null }).eq("id", pro.id);
    return { ok: true };
  });

export const getMyAvatar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase.from("professionals").select("avatar_path, avatar_kind").eq("user_id", userId).maybeSingle();
    if (!pro?.avatar_path) return { url: null as string | null, kind: null as "logo" | "photo" | null };
    const { data: signed } = await supabase.storage.from("professional-avatars").createSignedUrl(pro.avatar_path, 3600);
    return { url: signed?.signedUrl ?? null, kind: (pro.avatar_kind as "logo" | "photo" | null) };
  });


const packageSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  price_pence: z.coerce.number().int().min(0),
});

export const addPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => packageSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", userId).maybeSingle();
    if (!pro) throw new Error("Create your professional profile first");
    const { error } = await supabase.from("packages").insert({
      professional_id: pro.id,
      name: data.name,
      description: data.description ?? null,
      price_pence: data.price_pence,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("packages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const quoteSchema = z.object({
  professional_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  event_date: z.string().optional(),
  location: z.string().max(120).optional(),
  budget_band: z.string().max(40).optional(),
  details: z.string().min(10).max(2000),
});

export const submitQuoteRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => quoteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: qr, error } = await supabase
      .from("quote_requests")
      .insert({
        customer_id: userId,
        professional_id: data.professional_id,
        service_id: data.service_id ?? null,
        event_date: data.event_date || null,
        location: data.location ?? null,
        budget_band: data.budget_band ?? null,
        details: data.details,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // opening message
    await supabase.from("messages").insert({
      quote_request_id: qr.id,
      sender_id: userId,
      body: data.details,
    });
    return qr;
  });

export const myQuoteRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", userId).maybeSingle();
    const orFilter = pro ? `customer_id.eq.${userId},professional_id.eq.${pro.id}` : `customer_id.eq.${userId}`;
    const { data, error } = await supabase
      .from("quote_requests")
      .select("*, professional:professionals(business_name, slug, cover_image_url)")
      .or(orFilter)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: qr } = await supabase
      .from("quote_requests")
      .select("*, professional:professionals(id, business_name, slug, website, instagram, facebook, tiktok, linkedin, twitter, youtube)")
      .eq("id", data.id)
      .maybeSingle();
    const { data: myPro } = await supabase
      .from("professionals")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const isPro = !!qr && !!myPro && qr.professional_id === myPro.id;
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("quote_request_id", data.id)
      .order("created_at");
    return { qr, messages: messages ?? [], isPro, viewerId: userId };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ quote_request_id: z.string().uuid(), body: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Pro verification gate — only applies to professional senders. Clients
    // can always reply to pros who messaged them first.
    const { requireProVerified } = await import("@/lib/pro-verification.functions");
    try {
      await requireProVerified(supabase as never, userId, context.claims as never);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.startsWith("PRO_VERIFICATION_REQUIRED")) {
        throw new Error("Verify your email and mobile number before messaging clients.");
      }
      throw e;
    }
    const { error } = await supabase.from("messages").insert({
      quote_request_id: data.quote_request_id,
      sender_id: userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateQuoteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "quoted", "accepted", "declined", "completed", "cancelled"]),
        quoted_price_pence: z.coerce.number().int().min(0).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch = {
      status: data.status,
      ...(data.quoted_price_pence != null ? { quoted_price_pence: data.quoted_price_pence } : {}),
    };
    const { error } = await context.supabase.from("quote_requests").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleFavourite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ professional_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("favourites")
      .select("customer_id")
      .eq("customer_id", userId)
      .eq("professional_id", data.professional_id)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("favourites")
        .delete()
        .eq("customer_id", userId)
        .eq("professional_id", data.professional_id);
      return { favourited: false };
    }
    await supabase.from("favourites").insert({ customer_id: userId, professional_id: data.professional_id });
    return { favourited: true };
  });

export const myFavourites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("favourites")
      .select("professional:professionals(id, slug, business_name, cover_image_url, starting_price_pence, city, rating_avg, is_verified)")
      .order("created_at", { ascending: false });
    return (data ?? []).map((r) => r.professional).filter(Boolean);
  });

export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        quote_request_id: z.string().uuid(),
        rating: z.coerce.number().int().min(1).max(5),
        body: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: qr } = await supabase
      .from("quote_requests")
      .select("professional_id, customer_id, status, client_status, closed")
      .eq("id", data.quote_request_id)
      .maybeSingle();
    if (!qr || qr.customer_id !== userId) throw new Error("Not your booking");
    const allowed = qr.status === "completed" || qr.status === "cancelled" || qr.closed || qr.client_status === "closed";
    if (!allowed) throw new Error("Booking is not completed or closed yet");
    const { error } = await supabase.from("reviews").insert({
      quote_request_id: data.quote_request_id,
      professional_id: qr.professional_id,
      customer_id: userId,
      rating: data.rating,
      body: data.body ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
