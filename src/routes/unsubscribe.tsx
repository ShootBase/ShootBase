import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { SiteHeader } from "@/components/site/Header";
import { SiteFooter } from "@/components/site/Footer";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Unsubscribe — Shootbase" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnsubscribePage,
});

type State = "checking" | "ready" | "already" | "invalid" | "submitting" | "success" | "error";

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      try {
        const res = await fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!res.ok) { setState("invalid"); return; }
        if (json.valid === false && json.reason === "already_unsubscribed") { setState("already"); return; }
        if (json.valid) { setState("ready"); return; }
        setState("invalid");
      } catch {
        setState("invalid");
      }
    })();
  }, [token]);

  async function confirm() {
    if (!token) return;
    setState("submitting");
    try {
      const res = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Unsubscribe failed"); setState("error"); return; }
      if (json.success || json.reason === "already_unsubscribed") { setState("success"); return; }
      setError("Unsubscribe failed");
      setState("error");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setState("error");
    }
  }

  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-md w-full text-center">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">Email preferences</p>
          {state === "checking" && <p className="text-sm text-ink/60">Checking your link…</p>}
          {state === "invalid" && (
            <>
              <h1 className="font-display text-3xl mb-3">Link not valid</h1>
              <p className="text-sm text-ink/70">This unsubscribe link is invalid or has expired.</p>
            </>
          )}
          {state === "already" && (
            <>
              <h1 className="font-display text-3xl mb-3">Already unsubscribed</h1>
              <p className="text-sm text-ink/70">You've already been removed from our emails.</p>
            </>
          )}
          {state === "ready" && (
            <>
              <h1 className="font-display text-3xl mb-4">Unsubscribe from Shootbase emails</h1>
              <p className="text-sm text-ink/70 mb-8">Confirm below to stop receiving emails from Shootbase.</p>
              <button onClick={confirm} className="bg-ink text-paper px-8 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold">
                Confirm unsubscribe
              </button>
            </>
          )}
          {state === "submitting" && <p className="text-sm text-ink/60">Working…</p>}
          {state === "success" && (
            <>
              <h1 className="font-display text-3xl mb-3">You're unsubscribed</h1>
              <p className="text-sm text-ink/70">You won't receive further emails from Shootbase.</p>
            </>
          )}
          {state === "error" && (
            <>
              <h1 className="font-display text-3xl mb-3">Something went wrong</h1>
              <p className="text-sm text-ink/70">{error}</p>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
