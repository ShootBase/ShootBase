import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/pro/help")({
  beforeLoad: () => {
    throw redirect({ to: "/help" });
  },
  component: () => null,
});
