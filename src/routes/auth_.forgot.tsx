import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter } from "@/components/site/Footer";
import { ShootbaseLogo } from "@/components/site/Logo";

export const Route = createFileRoute("/auth_/forgot")({
  head: () => ({ meta: [{ title: "Reset password — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="bg-paper min-h-screen">
      <div className="max-w-md mx-auto px-6 py-12">
        <ShootbaseLogo className="h-60 w-auto mx-auto mb-8" />
        <h1 className="font-display text-4xl mb-6">Reset password</h1>
        {sent ? (
          <p className="text-sm text-ink/70">If that email exists, a reset link is on its way.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:border-gold"
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button className="w-full bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold">
              Send reset link
            </button>
          </form>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
