import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/pro/invoice/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/create-invoice-editor/$id", params: { id: params.id } });
  },
});