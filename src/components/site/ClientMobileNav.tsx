import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Briefcase, MessageSquare, Users, User } from "lucide-react";
import { useRole } from "@/lib/role-context";

type Item = {
  label: string;
  to: string;
  hash?: string;
  Icon: typeof LayoutGrid;
  match: (pathname: string, hash: string) => boolean;
};

const ITEMS: Item[] = [
  {
    label: "Dashboard",
    to: "/dashboard",
    Icon: LayoutGrid,
    match: (p, h) => p === "/dashboard" && !h,
  },
  {
    label: "My Jobs",
    to: "/dashboard",
    hash: "my-jobs",
    Icon: Briefcase,
    match: (p, h) => (p === "/dashboard" && h === "my-jobs") || p.startsWith("/jobs/"),
  },
  {
    label: "Messages",
    to: "/customer/messages",
    Icon: MessageSquare,
    match: (p) => p.startsWith("/customer/messages") || p.startsWith("/threads/"),
  },
  {
    label: "Responses",
    to: "/dashboard",
    hash: "responses",
    Icon: Users,
    match: (p, h) => p === "/dashboard" && h === "responses",
  },
  {
    label: "Profile",
    to: "/account/settings",
    Icon: User,
    match: (p) => p.startsWith("/account/settings") || p.startsWith("/profile") || p.startsWith("/help"),
  },
];

export function ClientMobileNav() {
  const { activeRole, loaded } = useRole();
  const { pathname, hash } = useRouterState({ select: (s) => s.location });

  // Client-only nav
  if (loaded && activeRole === "professional") return null;

  const cleanHash = (hash || "").replace(/^#/, "");

  return (
    <>
      {/* Spacer so fixed nav doesn't cover content */}
      <div className="md:hidden h-20" aria-hidden="true" />
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-ink/10 pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5 max-w-md mx-auto">
          {ITEMS.map(({ to, hash: itemHash, label, Icon, match }) => {
            const active = match(pathname, cleanHash);
            return (
              <Link
                key={label}
                to={to}
                hash={itemHash}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[44px] py-2.5 text-[10px] transition-colors ${
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
