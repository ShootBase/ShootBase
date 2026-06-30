import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { setPreviewOverride } from "@/lib/country-detect";
import { ShootbaseLogo } from "@/components/site/Logo";

const searchSchema = z.object({
  account: z.enum(["Nigeria", "United Kingdom"]).optional(),
  platform: z.enum(["Nigeria", "United Kingdom"]).optional(),
});

export const Route = createFileRoute("/country-mismatch")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Wrong country — Shootbase" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CountryMismatchPage,
});

function CountryMismatchPage() {
  const { account, platform } = Route.useSearch();
  const accountIsNg = account === "Nigeria";
  const message = accountIsNg
    ? "This account belongs to ShootBase Nigeria. Please use the Nigeria platform."
    : "This account belongs to ShootBase UK. Please use the UK platform.";
  const goHref = accountIsNg ? "/ng" : "/gb";
  const goLabel = accountIsNg ? "Go to ShootBase Nigeria" : "Go to ShootBase UK";

  async function switchAndSignOut() {
    await supabase.auth.signOut();
    setPreviewOverride(accountIsNg ? "NG" : "GB");
    window.location.replace("/");
  }

  return (
    <div className="bg-paper min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <ShootbaseLogo className="h-40 w-auto mx-auto mb-8" />
      <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3 text-center">
        Wrong platform
      </p>
      <h1 className="font-display text-3xl mb-3 text-center max-w-md">{message}</h1>
      <p className="text-sm text-ink/70 text-center mb-8 max-w-md">
        You're currently on the {platform === "Nigeria" ? "Nigeria" : "UK"} platform but your account is registered under{" "}
        {accountIsNg ? "ShootBase Nigeria" : "ShootBase UK"}.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={switchAndSignOut}
          className="w-full bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold"
        >
          {goLabel}
        </button>
        <Link
          to={goHref}
          className="text-center text-xs text-ink/60 hover:text-gold underline"
        >
          Or open {goLabel.toLowerCase()} in this tab
        </Link>
      </div>
    </div>
  );
}
