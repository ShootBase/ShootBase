import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/professional-dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/pro/dashboard" });
  },
  component: () => null,
});
