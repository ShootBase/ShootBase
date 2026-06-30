import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setPreviewOverride } from "@/lib/country-detect";
import { ComingSoonNigeria } from "@/components/site/ComingSoonNigeria";

export const Route = createFileRoute("/preview/ng")({
  component: PreviewNg,
});

function PreviewNg() {
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
      // Enable NG preview for this session.
      setPreviewOverride("NG");
      try {
        window.localStorage.setItem("shootbase:admin-country", "Nigeria");
      } catch {}
      setState("ok");
      // Hard reload so all guards (CountryGate, admin queries) re-evaluate
      // against the NG scope from the very first paint.
      window.location.replace("/");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (state === "blocked") return <ComingSoonNigeria />;
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper text-foreground">
      <p className="text-sm text-muted-foreground">Loading Nigeria preview…</p>
    </div>
  );
}
