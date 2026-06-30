import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter } from "@/components/site/Footer";
import { ShootbaseLogo } from "@/components/site/Logo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password" }, { name: "robots", content: "noindex" }] }),
  component: Reset,
});

function Reset() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // 'checking' = waiting for a recovery session; 'ready' = user arrived via reset link; 'invalid' = no recovery context
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const navigate = useNavigate();

  useEffect(() => {
    let resolved = false;
    // Supabase emits PASSWORD_RECOVERY when the user lands via the reset link (parses hash → session).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        resolved = true;
        setState("ready");
      }
    });
    // Fallback: hash may already be processed before the listener attaches.
    // We accept an existing session ONLY if the URL hash indicates a recovery flow.
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (/type=recovery/.test(hash)) {
      resolved = true;
      setState("ready");
    } else {
      // Give Supabase a beat to fire PASSWORD_RECOVERY, then mark invalid.
      const t = setTimeout(() => { if (!resolved) setState("invalid"); }, 1500);
      return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
    }
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setErr(error.message);
    else {
      setDone(true);
      setTimeout(() => navigate({ to: "/dashboard" }), 1200);
    }
  }

  return (
    <div className="bg-paper min-h-screen">
      <div className="max-w-md mx-auto px-6 py-12">
        <ShootbaseLogo className="h-60 w-auto mx-auto mb-8" />
        <h1 className="font-display text-4xl mb-6">Set a new password</h1>
        {state === "checking" && <p className="text-sm text-ink/60">Validating reset link…</p>}
        {state === "invalid" && (
          <div className="space-y-3">
            <p className="text-sm">This password reset link is invalid or has expired.</p>
            <button
              type="button"
              onClick={() => navigate({ to: "/auth/forgot" })}
              className="text-xs uppercase tracking-widest underline hover:text-gold"
            >
              Request a new link
            </button>
          </div>
        )}
        {state === "ready" && (done ? (
          <p className="text-sm">Password updated. Redirecting…</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="password"
              minLength={6}
              required
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:border-gold"
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button
              type="submit"
              className="w-full bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold"
            >
              Update password
            </button>
          </form>
        ))}
      </div>
      <SiteFooter />
    </div>
  );
}
