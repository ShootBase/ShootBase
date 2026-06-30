import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { setPreviewOverride } from "@/lib/country-detect";

export const Route = createFileRoute("/preview/gb")({
  component: PreviewGb,
});

function PreviewGb() {
  useEffect(() => {
    setPreviewOverride(null);
    try {
      window.localStorage.setItem("shootbase:admin-country", "United Kingdom");
    } catch {}
    window.location.replace("/");
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper text-foreground">
      <p className="text-sm text-muted-foreground">Exiting preview…</p>
    </div>
  );
}
