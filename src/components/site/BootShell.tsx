import { ShootbaseLogo } from "./Logo";

/**
 * Branded full-screen shell shown while the app is resolving its first
 * authenticated paint, or while a route is pending. Logo + subtle skeleton
 * — no text content that could flash stale state.
 */
export function BootShell() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper boot-fade"
    >
      <ShootbaseLogo className="h-16 w-auto opacity-90" />
      <div className="mt-8 flex w-40 flex-col gap-2">
        <div className="boot-skeleton h-2 w-full rounded-full" />
        <div className="boot-skeleton h-2 w-3/4 rounded-full" />
      </div>
    </div>
  );
}

/**
 * Lightweight pending UI for route transitions. Renders inside the persistent
 * layout so the header/logo stay mounted above it.
 */
export function RoutePending() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="route-fade mx-auto w-full max-w-5xl px-6 py-10"
    >
      <div className="boot-skeleton mb-4 h-6 w-2/5 rounded-md" />
      <div className="boot-skeleton mb-2 h-3 w-full rounded-md" />
      <div className="boot-skeleton mb-2 h-3 w-11/12 rounded-md" />
      <div className="boot-skeleton mb-8 h-3 w-3/4 rounded-md" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="boot-skeleton h-32 rounded-lg" />
        <div className="boot-skeleton h-32 rounded-lg" />
      </div>
    </div>
  );
}
