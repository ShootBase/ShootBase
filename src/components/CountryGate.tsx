/**
 * Gates the entire app based on the active country.
 *
 * Country status lifecycle (`platform_countries.status`):
 *  - `live`     → fully public
 *  - `preview`  → only Super Admins may access; everyone else sees Coming Soon
 *  - `disabled` → Coming Soon for everyone
 *
 * Country resolution is delegated to `detectCountryCode`, which prioritises
 * the persistent preview override (set via `/ng`, `/preview/ng`, `/gb`,
 * `/preview/gb`). Once an override is active, NOTHING in this component
 * may clear it — auth state changes only re-evaluate access, they do not
 * reload the page or touch storage.
 */
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ComingSoonNigeria } from "@/components/site/ComingSoonNigeria";
import { detectCountryCode, PREVIEW_COUNTRY_KEY } from "@/lib/country-detect";

function isExemptPath(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return (
    p.startsWith("/auth") ||
    p.startsWith("/preview/") ||
    p === "/ng" ||
    p === "/gb"
  );
}

export function CountryGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "blocked">("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function evaluate() {
      const code = detectCountryCode();
      // eslint-disable-next-line no-console
      console.log("[CountryGate] evaluate", { code, path: window.location.pathname });
      if (code !== "NG") {
        if (!cancelled) setState("ok");
        return;
      }
      if (isExemptPath()) {
        if (!cancelled) setState("ok");
        return;
      }

      try {
        const { data: country } = await supabase
          .from("platform_countries")
          .select("status")
          .eq("code", "NG")
          .maybeSingle();
        if (cancelled) return;
        const status = (country?.status ?? "disabled") as "live" | "preview" | "disabled";
        if (status === "live") {
          setState("ok");
          return;
        }
        if (status === "preview") {
          const { data: userRes } = await supabase.auth.getUser();
          const uid = userRes?.user?.id;
          if (!uid) {
            if (!cancelled) setState("blocked");
            return;
          }
          const { data: isSuper } = await supabase.rpc("is_super_admin", { _uid: uid });
          if (cancelled) return;
          setState(isSuper === true ? "ok" : "blocked");
          return;
        }
        setState("blocked");
      } catch {
        if (!cancelled) setState("blocked");
      }
    }

    void evaluate();

    // Re-evaluate (no page reload — that previously caused a brief NG→UK
    // flash when auth events fired right after activating the preview) on
    // sign-in/out so Super Admin access updates immediately.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        // eslint-disable-next-line no-console
        console.log("[CountryGate] auth event", event);
        setTick((t) => t + 1);
      }
    });

    // Re-evaluate when the preview override changes in another tab.
    function onStorage(e: StorageEvent) {
      if (e.key === PREVIEW_COUNTRY_KEY) {
        // eslint-disable-next-line no-console
        console.log("[CountryGate] override changed in another tab →", e.newValue);
        setTick((t) => t + 1);
      }
    }
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [tick]);

  if (state === "loading") {
    return <div className="min-h-screen bg-paper" aria-hidden="true" />;
  }
  if (state === "blocked") return <ComingSoonNigeria />;
  return <>{children}</>;
}
