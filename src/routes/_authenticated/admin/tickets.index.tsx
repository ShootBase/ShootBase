import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/tickets/")({
  component: TicketPlaceholder,
});

function TicketPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-card/70 p-8 text-center shadow-sm">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-muted">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">Select a support ticket</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Choose any ticket from the inbox to open the full conversation, review customer details, and send an email reply.
      </p>
    </div>
  );
}