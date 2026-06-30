import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { setPreviewOverride } from "@/lib/country-detect";

/** Short alias for /preview/gb — clears any preview override and returns to UK. */
export const Route = createFileRoute("/gb")({
  component: GbEntry,
});

function GbEntry() {
  useEffect(() => {
    setPreviewOverride(null);
    try {
      window.localStorage.setItem("shootbase:admin-country", "United Kingdom");
    } catch {}
    window.location.replace("/");
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper text-foreground">
      <p className="text-sm text-muted-foreground">Returning to UK mode…</p>
    </div>
  );
}
