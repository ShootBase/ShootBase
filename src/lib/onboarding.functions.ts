import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdminOrStaff(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return;
  const { data: staff } = await supabase
    .from("staff_accounts")
    .select("role, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (staff?.status === "active" && (staff.role === "admin" || staff.role === "super_admin")) return;
  throw new Error("Forbidden");
}

export type OnboardingVideo = {
  id: string;
  title: string;
  subtitle: string;
  kind: "youtube" | "vimeo" | "mp4" | "url";
  url: string;
  thumbnail_url: string | null;
  duration_label: string | null;
  enabled: boolean;
};

export const getActiveOnboardingVideo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("onboarding_videos")
      .select("*")
      .eq("enabled", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as OnboardingVideo | null) ?? null;
  });

export const getAdminOnboardingVideo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrStaff(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("onboarding_videos")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as OnboardingVideo | null) ?? null;
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  subtitle: z.string().min(1).max(500),
  kind: z.enum(["youtube", "vimeo", "mp4", "url"]),
  url: z.string().url(),
  thumbnail_url: z.string().url().optional().or(z.literal("")),
  duration_label: z.string().max(20).optional().or(z.literal("")),
  enabled: z.boolean(),
});

export const upsertOnboardingVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminOrStaff(context.supabase, context.userId);
    const payload = {
      title: data.title,
      subtitle: data.subtitle,
      kind: data.kind,
      url: data.url,
      thumbnail_url: data.thumbnail_url || null,
      duration_label: data.duration_label || null,
      enabled: data.enabled,
    };
    const sb = context.supabase as any;
    if (data.id) {
      const { error } = await sb.from("onboarding_videos").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb.from("onboarding_videos").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
