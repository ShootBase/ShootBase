import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { setAccountType, getMyProfile } from "@/lib/marketplace.functions";
import { SiteHeader } from "@/components/site/Header";

const searchSchema = z.object({ as: z.enum(["customer", "pro"]).optional() });

export const Route = createFileRoute("/_authenticated/onboarding")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Choose your account type" }, { name: "robots", content: "noindex" }] }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [loading, setLoading] = useState<"customer" | "professional" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // skip if already chosen
  useEffect(() => {
    getMyProfile().then((me) => {
      if (me.profile?.account_type === "professional") navigate({ to: "/pro/dashboard" });
      else if (me.profile?.account_type === "customer") navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  useEffect(() => {
    if (search.as === "pro") void choose("professional");
    if (search.as === "customer") void choose("customer");
     
  }, []);

  async function choose(role: "customer" | "professional") {
    setErr(null);
    setLoading(role);
    try {
      const res = await setAccountType({ data: { role } });
      // Account type is LOCKED after first assignment. Honour the persisted role
      // returned by the server so a previously-registered pro can never land in
      // the client onboarding flow (and vice versa).
      const effectiveRole = (res as { locked?: boolean; role?: "customer" | "professional" })?.locked
        ? (res as { role: "customer" | "professional" }).role
        : role;
      navigate({ to: effectiveRole === "professional" ? "/pro/onboarding" : "/dashboard" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setLoading(null);
    }
  }

  return (
    <div className="dashboard-readable bg-paper min-h-screen">
      <SiteHeader />
      <div className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="font-display text-4xl mb-2">I am joining as</h1>
        <p className="text-sm text-ink/60 mb-10">Pick the option that matches how you'll use Shootbase.</p>
        <div className="grid md:grid-cols-2 gap-4">
          <button
            onClick={() => choose("customer")}
            disabled={!!loading}
            className="text-left border border-ink/15 p-8 hover:border-gold transition-colors disabled:opacity-50"
          >
            <p className="font-mono text-[10px] text-gold uppercase mb-3">Customer</p>
            <h2 className="font-display text-2xl mb-2">Hiring a pro</h2>
            <p className="text-sm text-ink/60">Browse portfolios, request quotes, and book a photographer or videographer.</p>
          </button>
          <button
            onClick={() => choose("professional")}
            disabled={!!loading}
            className="text-left border border-ink/15 p-8 hover:border-gold transition-colors disabled:opacity-50"
          >
            <p className="font-mono text-[10px] text-gold uppercase mb-3">Photographer / Videographer</p>
            <h2 className="font-display text-2xl mb-2">Joining as a pro</h2>
            <p className="text-sm text-ink/60">Build a profile, receive projects, and grow your bookings across the UK.</p>
          </button>
        </div>
        {err && <p className="text-xs text-destructive mt-6">{err}</p>}
      </div>
    </div>
  );
}
