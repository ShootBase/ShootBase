import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const deleteSchema = z.object({ confirm: z.literal("DELETE") });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Safety: never let the only active super_admin delete themselves and lock the platform out.
    const { data: staffRow } = await supabaseAdmin
      .from("staff_accounts")
      .select("role, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (staffRow?.role === "super_admin" && staffRow.status === "active") {
      const { count } = await supabaseAdmin
        .from("staff_accounts")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "super_admin")
        .eq("status", "active");
      if ((count ?? 0) <= 1) {
        throw new Error(
          "You are the only Super Admin. Promote another Super Admin before deleting this account.",
        );
      }
    }

    // Audit log first while we still have the user id resolvable.
    try {
      await supabaseAdmin.from("admin_audit_logs").insert({
        actor_user_id: userId,
        action: "account.self_delete",
        entity_type: "user",
        entity_id: userId,
        metadata: { type: "self_service" },
      });
    } catch (e) {
      console.warn("[deleteMyAccount] audit log failed", e);
    }

    // 1. Delete jobs that no professional ever unlocked (safe — nobody paid for them).
    //    Anonymise the rest so unlocked clients keep their history.
    const { data: jobs } = await supabaseAdmin
      .from("jobs")
      .select("id")
      .eq("customer_id", userId);
    const jobIds = (jobs ?? []).map((j) => j.id as string);
    if (jobIds.length) {
      const { data: unlocked } = await supabaseAdmin
        .from("lead_unlocks")
        .select("job_id")
        .in("job_id", jobIds);
      const unlockedSet = new Set((unlocked ?? []).map((u) => u.job_id as string));
      const deletable = jobIds.filter((id) => !unlockedSet.has(id));
      const keep = jobIds.filter((id) => unlockedSet.has(id));
      if (deletable.length) {
        await supabaseAdmin.from("jobs").delete().in("id", deletable);
      }
      if (keep.length) {
        await supabaseAdmin
          .from("jobs")
          .update({
            contact_name: null,
            contact_phone: null,
            client_display_name: "Deleted User",
            show_name_to_pros: false,
            status: "closed",
            close_reason: "no_longer_needed",
          })
          .in("id", keep);
      }
    }

    // 2. Professional profile (if any) → suspend and clear PII.
    const { data: pro } = await supabaseAdmin
      .from("professionals")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (pro?.id) {
      await supabaseAdmin
        .from("professionals")
        .update({
          status: "suspended",
          business_name: "Deleted Professional",
          contact_name: null,
          about: null,
          website: null,
          instagram: null,
          facebook: null,
          tiktok: null,
          linkedin: null,
          twitter: null,
          youtube: null,
          avatar_path: null,
          logo_url: null,
          cover_image_url: null,
          is_verified: false,
        })
        .eq("id", pro.id);
      await supabaseAdmin.from("portfolio_items").delete().eq("professional_id", pro.id);
      await supabaseAdmin.from("pro_notification_prefs").delete().eq("professional_id", pro.id);
      await supabaseAdmin.from("pro_saved_lead_views").delete().eq("professional_id", pro.id);
      await supabaseAdmin.from("pro_lead_dismissals").delete().eq("professional_id", pro.id);
      await supabaseAdmin.from("pro_lead_favourites").delete().eq("professional_id", pro.id);
      await supabaseAdmin.from("pro_lead_views").delete().eq("professional_id", pro.id);
      await supabaseAdmin.from("favourites").delete().eq("professional_id", pro.id);
    }

    // 3. Per-user app data we can safely drop.
    await supabaseAdmin.from("notifications").delete().eq("user_id", userId);
    await supabaseAdmin.from("client_notification_prefs").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    

    // 4. Staff record (already cleared the safety guard above).
    await supabaseAdmin.from("staff_accounts").delete().eq("user_id", userId);
    await supabaseAdmin.from("staff_permission_overrides").delete().eq("user_id", userId);

    // 5. Anonymise the profile — kept so messages/reviews stay readable for the other party.
    await supabaseAdmin
      .from("profiles")
      .update({
        full_name: "Deleted User",
        phone: null,
        avatar_url: null,
        verified_phone: false,
        account_type: null,
      } as never)
      .eq("id", userId);

    // 6. Finally remove the auth identity (Google/Apple OAuth links, sessions, password).
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authErr) throw new Error(authErr.message);

    return { ok: true };
  });
