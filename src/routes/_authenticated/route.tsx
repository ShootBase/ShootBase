import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { enforceCountryAccess } from "@/lib/enforce-country";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Cross-country firewall: prevents a GB user from loading the NG app
    // (or vice versa) via direct URL / refresh. Super Admins are exempt.
    const cc = await enforceCountryAccess(data.user.id);
    if (!cc.ok) {
      throw redirect({
        to: "/country-mismatch",
        search: { account: cc.profileCountry, platform: cc.platformCountry },
      });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
