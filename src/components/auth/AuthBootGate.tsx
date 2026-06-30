import { useEffect, useState, type ReactNode } from "react";
import { useRole } from "@/lib/role-context";
import { BootShell } from "@/components/site/BootShell";

/**
 * Prevents the "logged-out → logged-in" UI flicker on first paint.
 *
 * SSR always renders the unauthenticated shell (no cookies/session reach the
 * server). On the client, Supabase restores the session from localStorage
 * asynchronously, which causes header/footer/landing to swap from the guest
 * UI to the authenticated UI a few frames after hydration.
 *
 * We synchronously detect a stored Supabase session in localStorage at mount.
 * If one exists, we hold rendering on a neutral paper-colored shell until the
 * role context finishes loading, so the first visible frame already matches
 * the final authenticated UI. Visitors without a stored session see the page
 * immediately — no added latency for guests.
 */
function hasStoredSupabaseSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = window.localStorage.getItem(key);
        if (raw && raw.length > 2) return true;
      }
    }
  } catch {
    // Access to localStorage can throw in privacy modes — fail open.
    return false;
  }
  return false;
}

export function AuthBootGate({ children }: { children: ReactNode }) {
  const { loaded } = useRole();
  const [needsGate, setNeedsGate] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setMounted(true);
    setNeedsGate(hasStoredSupabaseSession());
  }, []);

  // Cap the gate at 350ms. If the role-resolution RPC is still running after
  // that, we'd rather let the page paint (header may briefly switch) than hold
  // a full-screen shell for seconds on every navigation/refresh.
  useEffect(() => {
    if (!mounted || !needsGate || loaded) return;
    const id = window.setTimeout(() => setTimedOut(true), 350);
    return () => window.clearTimeout(id);
  }, [mounted, needsGate, loaded]);

  if (mounted && needsGate && !loaded && !timedOut) {
    return <BootShell />;
  }
  return <>{children}</>;
}
