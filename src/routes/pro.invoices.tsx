import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/pro/invoices")({
  beforeLoad: () => {
    throw redirect({ to: "/create-invoice" });
  },
});