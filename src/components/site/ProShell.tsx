import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, ChevronDown, LogOut, Share2, Settings, Briefcase, Receipt } from "lucide-react";
import { useRole } from "@/lib/role-context";
import { DashboardFooter } from "@/components/site/DashboardFooter";
import { ShootbaseLogo } from "@/components/site/Logo";
import { ProVerificationBanner } from "@/components/pro/ProVerificationBanner";
import { ProMobileNav } from "@/components/site/ProMobileNav";
import { performSignOut } from "@/lib/auth-signout";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { to: "/pro/dashboard" as const, label: "Dashboard" },
  { to: "/pro/leads" as const, label: "Projects" },
  { to: "/pro/responses" as const, label: "Messages" },
  { to: "/create-invoice" as const, label: "Invoices" },
];

export function ProShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { activeRole, loaded } = useRole();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const queryClient = useQueryClient();

  // Route guard: clients cannot access Pro-only areas — bounce to client dashboard.
  useEffect(() => {
    if (!loaded) return;
    const isProOnlyRoute = pathname.startsWith("/pro") || pathname.startsWith("/create-invoice");
    if (activeRole && activeRole !== "professional" && isProOnlyRoute) {
      navigate({ to: "/dashboard" });
    }
  }, [loaded, activeRole, pathname, navigate]);

  async function handleLogout() {
    await performSignOut(queryClient);
    navigate({ to: "/", replace: true });
  }

  function goPostJobAsClient() {
    // Pros may post jobs too, but their account role MUST stay "professional".
    // Navigate to the public post-project page without touching the role.
    navigate({ to: "/customer/post-lead" });
  }


  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="dashboard-readable bg-paper min-h-screen flex flex-col">

      <nav className="sticky top-0 z-50 bg-paper/85 backdrop-blur-md border-b border-ink/5 px-6 py-0 grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <Link to="/pro/dashboard" className="shrink-0 justify-self-start">
          <ShootbaseLogo className="h-20 sm:h-24 md:h-28 w-auto" />
        </Link>
        <div className="hidden lg:flex justify-self-center gap-6 text-[11px] uppercase tracking-[0.2em] font-medium">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`hover:text-gold transition-colors ${isActive(n.to) ? "text-gold" : ""}`}
            >
              {n.label}
            </Link>
          ))}
        </div>
        <div className="justify-self-end flex items-center">
        {/* Desktop / iPad: Account dropdown */}
        <div className="hidden lg:block">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 text-[11px] uppercase tracking-widest border border-ink px-4 py-2 hover:bg-ink hover:text-paper transition-all">
              Account <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={goPostJobAsClient} className="cursor-pointer">
                <Briefcase className="mr-2 h-4 w-4" /> Post a Job (Hire)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/pro/settings" })} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" /> Account Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/pro/refunds" })} className="cursor-pointer">
                <Receipt className="mr-2 h-4 w-4" /> Refund Requests
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/refer" })} className="cursor-pointer">
                <Share2 className="mr-2 h-4 w-4" /> Refer a Friend
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600">
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile + Tablet hamburger: single source of navigation */}
        <div className="lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger className="inline-flex items-center justify-center h-11 w-11 border border-ink/20 rounded-sm" aria-label="Open menu">
              <Menu className="h-6 w-6" />
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-paper">
              <div className="flex flex-col gap-1 mt-8">
                <p className="text-[10px] uppercase tracking-widest text-ink/40 mb-2">Navigation</p>
                {NAV.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMobileOpen(false)}
                    className={`px-3 py-3 text-sm border-b border-ink/5 ${isActive(n.to) ? "text-gold" : "text-ink"}`}
                  >
                    {n.label}
                  </Link>
                ))}

                <p className="text-[10px] uppercase tracking-widest text-ink/40 mt-6 mb-2">Account</p>
                <button
                  onClick={() => { setMobileOpen(false); goPostJobAsClient(); }}
                  className="text-left px-3 py-3 text-sm border-b border-ink/5 flex items-center gap-2"
                >
                  <Briefcase className="h-4 w-4" /> Post a Job (Hire)
                </button>
                <Link
                  to="/pro/settings"
                  onClick={() => setMobileOpen(false)}
                  className="px-3 py-3 text-sm border-b border-ink/5 flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" /> Account Settings
                </Link>
                <Link
                  to="/pro/refunds"
                  onClick={() => setMobileOpen(false)}
                  className="px-3 py-3 text-sm border-b border-ink/5 flex items-center gap-2"
                >
                  <Receipt className="h-4 w-4" /> Refund Requests
                </Link>
                <Link
                  to="/refer"
                  onClick={() => setMobileOpen(false)}
                  className="px-3 py-3 text-sm border-b border-ink/5 flex items-center gap-2"
                >
                  <Share2 className="h-4 w-4" /> Refer a Friend
                </Link>
                <button
                  onClick={() => { setMobileOpen(false); void handleLogout(); }}
                  className="text-left px-3 py-3 text-sm border-b border-ink/5 flex items-center gap-2 text-red-600"
                >
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        </div>
      </nav>

      <ProVerificationBanner />
      <main className="flex-1 pb-24 lg:pb-0">{children}</main>
      <DashboardFooter />
      <ProMobileNav />
    </div>
  );
}
