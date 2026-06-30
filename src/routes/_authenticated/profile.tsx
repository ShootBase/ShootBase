import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useRole } from "@/lib/role-context";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: ProfileRedirect,
});

function ProfileRedirect() {
  const navigate = useNavigate();
  const { loaded, activeRole } = useRole();
  useEffect(() => {
    if (!loaded) return;
    if (activeRole === "professional") {
      void navigate({ to: "/pro/settings" });
    } else {
      void navigate({ to: "/dashboard" });
    }
  }, [loaded, activeRole, navigate]);
  return (
    <div className="min-h-[40vh] grid place-items-center text-sm text-ink/60">Loading profile…</div>
  );
}
