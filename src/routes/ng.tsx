import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setPreviewOverride } from "@/lib/country-detect";
import { ComingSoonNigeria } from "@/components/site/ComingSoonNigeria";

/**
 * Short alias for /preview/ng — activates Nigeria workspace mode for the
 * current session and reloads into the app. Super Admin only.
 */
export const Route = createFileRoute("/ng")({
  component: NgEntry,
});

function NgEntry() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ok" | "blocked">("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) {
        if (!cancelled) setState("blocked");
        return;
      }
      const { data: isSuper } = await supabase.rpc("is_super_admin", { _uid: uid });
      if (cancelled) return;
      if (isSuper !== true) {
        setState("blocked");
        return;
      }
      setPreviewOverride("NG");
      try {
        window.localStorage.setItem("shootbase:admin-country", "Nigeria");
      } catch {}
      setState("ok");
      window.location.replace("/");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (state === "blocked") return <ComingSoonNigeria />;
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper text-foreground">
      <p className="text-sm text-muted-foreground">Loading Nigeria workspace…</p>
    </div>
  );
}
