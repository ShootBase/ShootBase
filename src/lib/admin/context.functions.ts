import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PLATFORM_COUNTRIES,
  ROLE_DEFAULT_PERMISSIONS,
  type StaffContext,
  type StaffPermission,
  type StaffRole,
} from "./permissions";

export const getMyStaffContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StaffContext> => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("staff_accounts")
      .select("role,status,country")
      .eq("user_id", userId)
      .maybeSingle();
    if (!row || row.status !== "active") {
      return { isStaff: false, role: null, permissions: [], country: null, allowedCountries: [] };
    }
    const role = row.role as StaffRole;
    const country = (row as any).country as string | null;
    const { data: overrides } = await supabase
      .from("staff_permission_overrides")
      .select("permission,effect")
      .eq("user_id", userId);
    const allow = new Set<StaffPermission>(ROLE_DEFAULT_PERMISSIONS[role] ?? []);
    for (const o of overrides ?? []) {
      const p = o.permission as StaffPermission;
      if (o.effect === "allow") allow.add(p);
      else if (o.effect === "deny") allow.delete(p);
    }
    void supabase
      .from("staff_accounts")
      .update({ last_login_at: new Date().toISOString() })
      .eq("user_id", userId);

    const allCountries = PLATFORM_COUNTRIES.map((c) => c.name);
    const allowedCountries =
      role === "super_admin" || !country ? allCountries : [country];

    return {
      isStaff: true,
      role,
      permissions: Array.from(allow),
      country: role === "super_admin" ? null : country,
      allowedCountries,
    };
  });
