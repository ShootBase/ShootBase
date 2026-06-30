import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: AdminLayout,
  errorComponent: AdminErrorComponent,
});

function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}

function AdminErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  // Keep failures contained inside the admin console so a thrown server-fn
  // (e.g. "Not found", "Forbidden") never bubbles to the root "This page
  // didn't load" crash screen for admin/staff users.
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.error("[admin error boundary]", error);
  }
  const router = useRouter();
  const msg = String(error?.message ?? "");
  const notFound = /not found/i.test(msg);
  const forbidden = /forbidden|unauthor/i.test(msg);

  return (
    <AdminShell>
      <div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold">
          {notFound
            ? "Not found"
            : forbidden
            ? "You do not have permission to view this"
            : "Something went wrong loading this page"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {notFound
            ? "This record may have been deleted or the link is out of date."
            : forbidden
            ? "Ask a Super Admin if you believe this is a mistake."
            : "Please try again in a moment."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">Back to dashboard</Link>
          </Button>
          {!notFound && !forbidden && (
            <Button
              size="sm"
              onClick={() => {
                router.invalidate();
                reset();
              }}
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
