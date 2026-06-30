import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Search, MessageSquare, Inbox } from "lucide-react";
import { useRole } from "@/lib/role-context";

type Item = {
  label: string;
  to: string;
  Icon: typeof LayoutGrid;
  match: (pathname: string) => boolean;
};

const ITEMS: Item[] = [
  { label: "Dashboard", to: "/pro/dashboard", Icon: LayoutGrid, match: (p) => p === "/pro/dashboard" },
  { label: "Projects", to: "/pro/leads", Icon: Search, match: (p) => p.startsWith("/pro/leads") },
  { label: "Messages", to: "/pro/responses", Icon: MessageSquare, match: (p) => p.startsWith("/pro/responses") || p.startsWith("/threads/") },
  { label: "Leads", to: "/pro/unlocked", Icon: Inbox, match: (p) => p.startsWith("/pro/unlocked") || p.startsWith("/pro/posted-jobs") },
];

export function ProMobileNav() {
  const { activeRole, loaded } = useRole();
  const { pathname } = useRouterState({ select: (s) => s.location });

  if (loaded && activeRole !== "professional") return null;

  return (
    <>
      <div className="lg:hidden h-20" aria-hidden="true" />
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-ink/10 pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <div className="grid grid-cols-4 max-w-md mx-auto">
          {ITEMS.map(({ to, label, Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={label}
                to={to}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[48px] py-2.5 text-[10px] transition-colors ${
                  active ? "text-ink" : "text-ink/50 hover:text-ink"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-[20px] h-[20px]" strokeWidth={active ? 2 : 1.6} />
                <span className={active ? "font-medium" : ""}>{label}</span>
                {active && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-brass" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
