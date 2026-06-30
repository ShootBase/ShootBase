import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const modeSchema = z.enum(["instant", "daily", "weekly", "off"]);

export const getMyLeadPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase
      .from("professionals")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!pro) return { hasProfile: false as const };

    const { data } = await supabase
      .from("pro_notification_prefs")
      .select("lead_email_mode, lead_inapp_enabled")
      .eq("professional_id", pro.id)
      .maybeSingle();

    return {
      hasProfile: true as const,
      lead_email_mode: (data?.lead_email_mode ?? "instant") as
        | "instant"
        | "daily"
        | "weekly"
        | "off",
      lead_inapp_enabled: data?.lead_inapp_enabled ?? true,
    };
  });

export const updateMyLeadPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        lead_email_mode: modeSchema,
        lead_inapp_enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase
      .from("professionals")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!pro) throw new Error("No professional profile");

    const { error } = await supabase
      .from("pro_notification_prefs")
      .upsert(
        {
          professional_id: pro.id,
          lead_email_mode: data.lead_email_mode,
          lead_inapp_enabled: data.lead_inapp_enabled,
        },
        { onConflict: "professional_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type MatchingLead = {
  notification_id: string;
  job_id: string;
  created_at: string;
  email_status: string;
  title: string;
  city: string;
  service_name: string | null;
  event_date: string | null;
  budget_band: string | null;
  summary: string | null;
  urgency: string | null;
  unlocked: boolean;
};

export const getMyMatchingLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: pro } = await supabase
      .from("professionals")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!pro) return { hasProfile: false as const, matches: [] as MatchingLead[], unreadCount: 0 };

    const { data: rows, error } = await supabase.rpc("my_matching_leads" as never);
    if (error) throw new Error(error.message);

    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .like("url", "/pro/leads%")
      .is("read_at", null);

    return {
      hasProfile: true as const,
      matches: (rows ?? []) as unknown as MatchingLead[],
      unreadCount: count ?? 0,
    };
  });
