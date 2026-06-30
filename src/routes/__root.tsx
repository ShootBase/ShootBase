import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { RoleProvider } from "../lib/role-context";
import { SessionTimeout } from "../components/auth/SessionTimeout";
import { MessageNotifier } from "../components/notifications/MessageNotifier";
import { AuthBootGate } from "../components/auth/AuthBootGate";
import { ActivityLogger } from "../components/auth/ActivityLogger";
import { CountryGate } from "../components/CountryGate";
import { CountryPreviewBadge } from "../components/site/CountryPreviewBadge";



function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" },
      { title: "Shootbase - UK Photographers & Videographers" },
      { name: "description", content: "Shootbase is a UK-wide marketplace connecting clients with vetted professional photographers and videographers." },
      { name: "author", content: "Shootbase" },
      { property: "og:title", content: "Shootbase - UK Photographers & Videographers" },
      { property: "og:description", content: "Shootbase is a UK-wide marketplace connecting clients with vetted professional photographers and videographers." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Shootbase" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Shootbase - UK Photographers & Videographers" },
      { name: "twitter:description", content: "Shootbase is a UK-wide marketplace connecting clients with vetted professional photographers and videographers." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/aiGgPuAKe4MRjc0LSBndPGwlFvo1/social-images/social-1782480347015-Screenshot_2026-06-26_at_14.25.38.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/aiGgPuAKe4MRjc0LSBndPGwlFvo1/social-images/social-1782480347015-Screenshot_2026-06-26_at_14.25.38.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) localStorage.setItem("shootbase.ref", ref);
    } catch {}
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RoleProvider>
        <SessionTimeout />
        <MessageNotifier />
        <ActivityLogger />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <CountryGate>
          <AuthBootGate>
            <div className="min-h-screen bg-paper text-foreground antialiased">
              <Outlet />
            </div>
            <CountryPreviewBadge />
          </AuthBootGate>
        </CountryGate>

      </RoleProvider>

    </QueryClientProvider>
  );
}
