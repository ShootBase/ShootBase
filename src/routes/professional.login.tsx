import { createFileRoute, redirect } from "@tanstack/react-router";

// Alias for the singular URL — canonical route is /professionals/login.
export const Route = createFileRoute("/professional/login")({
  beforeLoad: () => {
    throw redirect({ to: "/professionals/login" });
  },
  component: () => null,
});
