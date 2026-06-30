import { createFileRoute, redirect } from "@tanstack/react-router";

// Convenience alias so /admin/login routes to the shared auth screen.
// Admins sign in via the standard /auth page; this prevents a 404 for
// anyone typing the natural URL.
export const Route = createFileRoute("/admin/login")({
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});
