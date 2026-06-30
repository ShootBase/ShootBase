import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auditLog } from "./_guard";

const MODE = z.enum(["soft", "full"]);

async function requireSuperAdmin(supabase: any, userId: string) {
  const { data: role } = await supabase.rpc("staff_role_of", { _uid: userId });
  if (role !== "super_admin") throw new Error("Forbidden: super_admin only");
}

export const previewLaunchCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mode: MODE }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    const { data: counts, error } = await context.supabase.rpc(
      "admin_launch_cleanup_preview",
      { _mode: data.mode },
    );
    if (error) throw new Error(error.message);
    return counts as Record<string, number | string>;
  });

export const runLaunchCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        mode: MODE,
        confirmation: z.string(),
        password: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);

    if (data.mode === "full" && data.confirmation !== "RESET SHOOTBASE") {
      throw new Error('Confirmation phrase must be "RESET SHOOTBASE"');
    }
    if (data.mode === "soft" && data.confirmation.trim().length < 2) {
      throw new Error("Type CONFIRM to proceed");
    }

    // Re-verify password against the caller's account.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    if (uErr || !u?.user?.email) throw new Error("Could not verify your account");
    const email = u.user.email;

    const { createClient } = await import("@supabase/supabase-js");
    const verifyClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
    );
    const { error: signErr } = await verifyClient.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (signErr) throw new Error("Incorrect password");

    await auditLog(context.supabase, "launch_cleanup.start", "system", data.mode, {
      mode: data.mode,
    });

    const { data: result, error } = await context.supabase.rpc(
      "admin_launch_cleanup_run",
      { _mode: data.mode },
    );
    if (error) throw new Error(error.message);

    let users_deleted = 0;
    let users_failed = 0;
    if (data.mode === "full") {
      // Delete non-super_admin auth users via the admin API. profiles for these
      // users were already deleted inside the RPC.
      const superAdminIds = new Set<string>();
      const { data: supers } = await supabaseAdmin
        .from("staff_accounts")
        .select("user_id")
        .eq("status", "active")
        .eq("role", "super_admin");
      for (const s of supers ?? []) superAdminIds.add(s.user_id);

      let page = 1;
      const perPage = 200;
      // Limit total iterations to avoid runaway loops.
      for (let i = 0; i < 50; i++) {
        const { data: list, error: listErr } =
          await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (listErr) break;
        const users = list?.users ?? [];
        if (users.length === 0) break;
        for (const usr of users) {
          if (superAdminIds.has(usr.id)) continue;
          try {
            await supabaseAdmin.auth.admin.deleteUser(usr.id);
            users_deleted++;
          } catch {
            users_failed++;
          }
        }
        if (users.length < perPage) break;
        // Pagination shifts as we delete; keep page=1 to consume new top of list.
        page = 1;
      }
    }

    await auditLog(context.supabase, "launch_cleanup.complete", "system", data.mode, {
      mode: data.mode,
      result,
      users_deleted,
      users_failed,
    });

    return { ...(result as object), users_deleted, users_failed };
  });
