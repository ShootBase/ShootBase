import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const leadSchema = z.object({
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
});

const publishLeadSchema = z.object({
  email: z.string().trim().email(),
  lead: leadSchema,
});

/**
 * Publishes a job on behalf of a freshly-created (unverified) email/password
 * client. We auto-confirm the user server-side so they can sign in immediately
 * and reach their dashboard — Supabase has already dispatched the verification
 * email from signUp(), so the link still arrives in the inbox. This keeps lead
 * capture friction-free (job goes live before email verification).
 */
export const publishLeadAsNewClient = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => publishLeadSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    // Locate the just-signed-up user. There is a brief propagation window
    // between auth.signUp() resolving on the client and the new row appearing
    // in admin.listUsers(); retry once with a short delay if not found.
    async function findUserIdByEmail(): Promise<string | null> {
      let page = 1;
      while (page <= 20) {
        const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(error.message);
        const hit = list.users.find((u) => (u.email || "").toLowerCase() === email);
        if (hit) return hit.id;
        if (list.users.length < 200) return null;
        page += 1;
      }
      return null;
    }
    let userId = await findUserIdByEmail();
    if (!userId) {
      await new Promise((r) => setTimeout(r, 600));
      userId = await findUserIdByEmail();
    }
    if (!userId) throw new Error("Account not found — please try again.");

    // Auto-confirm so they can sign in immediately and access the dashboard.
    await supabaseAdmin.auth.admin.updateUserById(userId, { email_confirm: true } as never);

    // Profile + customer role.
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      account_type: "customer",
      full_name: data.lead.contact_name || null,
      phone: data.lead.contact_phone || null,
    } as never);
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "customer" } as never, { onConflict: "user_id,role" } as never);

    // Geocode (best-effort).
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const { geocodeUk } = await import("@/lib/geocode.server");
      const hit = await geocodeUk("", data.lead.city);
      if (hit) { lat = hit.lat; lng = hit.lng; }
    } catch { /* non-blocking */ }

    const lead = data.lead;
    const summary = lead.details.slice(0, 160);
    const { data: job, error: insErr } = await supabaseAdmin
      .from("jobs")
      .insert({
        customer_id: userId,
        service_id: lead.service_id,
        kind: lead.kind,
        title: lead.title,
        summary,
        details: lead.details,
        city: lead.city,
        event_date: lead.event_date || null,
        event_time: lead.event_time || null,
        flexible_dates: !!lead.flexible_dates,
        duration: lead.duration || null,
        duration_days: lead.duration_days ?? null,
        duration_start_date: lead.duration_start_date || null,
        duration_end_date: lead.duration_end_date || null,
        duration_consecutive: lead.duration_consecutive ?? null,
        duration_flexible: lead.duration_flexible ?? null,
        budget_band: lead.budget_band || null,
        contact_name: lead.contact_name || null,
        contact_phone: lead.contact_phone || null,
        preferred_contact: lead.preferred_contact || null,
        inspiration_links: lead.inspiration_links ?? [],
        event_type: lead.event_type || null,
        urgency: lead.urgency || null,
        client_display_name: lead.client_display_name || lead.contact_name || null,
        show_name_to_pros: lead.show_name_to_pros ?? true,
        latitude: lat,
        longitude: lng,
      } as never)
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { ok: true, user_id: userId, job_id: (job as { id: string }).id };
  });



const checkSchema = z.object({
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

/**
 * Public, no-auth helper used by the job-request modal to detect whether a
 * client visitor already has a Shootbase account before account creation.
 * Returns only booleans (no PII, no owner info).
 *
 * Trade-off: this is a minor email-enumeration vector. Accepted by product
 * to keep the lead-capture flow seamless ("we found an existing account…").
 */
export const checkClientAccountExists = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => checkSchema.parse(d))
  .handler(async ({ data }) => {
    const email = (data.email || "").trim().toLowerCase();
    const phoneRaw = (data.phone || "").trim();
    const phoneDigits = phoneRaw.replace(/\D/g, "");

    let email_exists = false;
    let phone_exists = false;

    if (!email && !phoneDigits) return { email_exists, phone_exists };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (email) {
      // Paginate auth.users — fine for our scale; small project.
      let page = 1;
      while (page <= 20) {
        const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) break;
        if (list.users.some((u) => (u.email || "").toLowerCase() === email)) {
          email_exists = true;
          break;
        }
        if (list.users.length < 200) break;
        page += 1;
      }
    }

    if (phoneDigits.length >= 7) {
      // Match the trailing 7+ digits to ignore +44 / leading-0 differences.
      const tail = phoneDigits.slice(-9);
      const { data: rows } = await supabaseAdmin
        .from("profiles")
        .select("id, phone")
        .not("phone", "is", null);
      if (rows) {
        phone_exists = rows.some((r) => {
          const d = String(r.phone || "").replace(/\D/g, "");
          return d.length >= 7 && d.endsWith(tail);
        });
      }
    }

    return { email_exists, phone_exists };
  });
