import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  LifeBuoy,
  ShieldCheck,
  FileText,
  Settings,
  Bell,
  UserCog,
  Gift,
  Activity,
  LineChart,
  Globe2,
  Crown,
  ChevronRight,
  Eraser,
  Radio,
  Flag,

} from "lucide-react";


import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getMyStaffContext } from "@/lib/admin/context.functions";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { CountrySwitcher } from "@/components/admin/CountrySwitcher";
import { AdminCountryProvider } from "@/lib/admin-country";
import { hasPerm, ROLE_LABEL, type StaffContext, type StaffPermission } from "@/lib/admin/permissions";
import { createContext, useContext } from "react";

const StaffCtx = createContext<StaffContext | null>(null);
export const useStaff = () => useContext(StaffCtx);

function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async () => {
    try {
      // Navigate first so admin-only components unmount before the session is cleared,
      // preventing in-flight protected server-fn calls from 401-ing into the root error boundary.
      await navigate({ to: "/auth", replace: true });
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success("Signed out");
    } catch (e) {
      console.error("[admin signout]", e);
    }
  };
}

function SignOutMenuItem() {
  const signOut = useSignOut();
  return (
    <DropdownMenuItem
      onSelect={(e) => { e.preventDefault(); void signOut(); }}
      className="text-destructive focus:text-destructive cursor-pointer"
    >
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </DropdownMenuItem>
  );
}

type NavItem = { title: string; url: string; icon: any; perm?: StaffPermission; superOnly?: boolean };
type NavSection = { label: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", url: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "Support",
    items: [
      { title: "Inbox", url: "/admin/tickets", icon: LifeBuoy, perm: "tickets.view" },
      { title: "Project notifications", url: "/admin/project-notifications", icon: Bell, perm: "notifications.view" },
      { title: "Project quality reports", url: "/admin/project-reports", icon: Flag, perm: "users.edit" },
      { title: "Project disputes", url: "/admin/project-disputes", icon: ShieldCheck, perm: "users.edit" },
      { title: "Video moderation", url: "/admin/videos", icon: Flag, perm: "users.edit" },
    ],
  },
  {
    label: "People",
    items: [
      { title: "Users", url: "/admin/users", icon: Users, perm: "users.view" },
      { title: "Staff", url: "/admin/staff", icon: UserCog, perm: "staff.manage" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { title: "Revenue analytics", url: "/admin/revenue", icon: LineChart, superOnly: true },
      { title: "Geo analytics", url: "/admin/geo", icon: Globe2, perm: "analytics.view" },
      { title: "Platform activity", url: "/admin/activity", icon: Activity, perm: "analytics.view" },
    ],
  },
  {
    label: "Growth",
    items: [
      { title: "Coins", url: "/admin/coins", icon: Activity, perm: "coins.view" },
      { title: "Bank transfers (NG)", url: "/admin/bank-transfers", icon: Activity, perm: "coins.bank_transfers" },
      { title: "Subscriptions (live)", url: "/admin/subscriptions", icon: Radio, perm: "users.view" },
      { title: "VIP users", url: "/admin/vip", icon: Crown, perm: "users.view" },
      { title: "Promo codes", url: "/admin/promos", icon: Gift, perm: "settings.manage" },
    ],
  },

  {
    label: "System",
    items: [
      { title: "Countries", url: "/admin/countries", icon: Globe2, superOnly: true },
      { title: "Audit logs", url: "/admin/audit", icon: FileText, perm: "audit.view" },
      { title: "Platform settings", url: "/admin/settings", icon: Settings, perm: "settings.manage" },
      { title: "Launch cleanup", url: "/admin/launch-cleanup", icon: Eraser, superOnly: true },
    ],
  },
];

const TITLE_MAP: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/tickets": "Support inbox",
  "/admin/users": "Users",
  "/admin/staff": "Staff",
  "/admin/audit": "Audit logs",
  "/admin/project-notifications": "Project notifications",
  "/admin/project-reports": "Project quality reports",
  "/admin/project-disputes": "Project disputes",
  "/admin/coins": "Coins",
  "/admin/bank-transfers": "Bank transfers",
  "/admin/subscriptions": "Subscriptions (live)",
  "/admin/revenue": "Revenue analytics",
  "/admin/geo": "Geo analytics",
  "/admin/promos": "Promo codes",
  "/admin/vip": "VIP users",
  "/admin/activity": "Platform activity",
  "/admin/videos": "Video moderation",

  "/admin/settings": "Platform settings",
  "/admin/launch-cleanup": "Launch cleanup",
};

// Per-route access requirements. Used by the shell to render an
// "Access denied" page when a staff member browses to a URL their role
// doesn't permit (e.g. a Team Member typing /admin/users into the bar).
type RouteReq = { perm?: StaffPermission; superOnly?: boolean };
const ROUTE_REQUIREMENTS: { prefix: string; req: RouteReq }[] = [
  { prefix: "/admin/tickets", req: { perm: "tickets.view" } },
  { prefix: "/admin/project-notifications", req: { perm: "notifications.view" } },
  { prefix: "/admin/project-reports", req: { perm: "users.edit" } },
  { prefix: "/admin/project-disputes", req: { perm: "users.edit" } },
  { prefix: "/admin/users", req: { perm: "users.view" } },
  { prefix: "/admin/staff", req: { perm: "staff.manage" } },
  { prefix: "/admin/audit", req: { perm: "audit.view" } },
  { prefix: "/admin/revenue", req: { superOnly: true } },
  { prefix: "/admin/geo", req: { perm: "analytics.view" } },
  { prefix: "/admin/activity", req: { perm: "analytics.view" } },
  { prefix: "/admin/coins", req: { perm: "coins.view" } },
  { prefix: "/admin/bank-transfers", req: { perm: "coins.bank_transfers" } },
  { prefix: "/admin/subscriptions", req: { perm: "users.view" } },
  { prefix: "/admin/vip", req: { perm: "users.view" } },
  { prefix: "/admin/promos", req: { perm: "settings.manage" } },
  { prefix: "/admin/settings", req: { perm: "settings.manage" } },
  { prefix: "/admin/countries", req: { superOnly: true } },
  { prefix: "/admin/launch-cleanup", req: { superOnly: true } },
];

function isPathAllowed(pathname: string, ctx: StaffContext): boolean {
  if (pathname === "/admin" || pathname === "/admin/") return true;
  const match = ROUTE_REQUIREMENTS.find((r) => pathname.startsWith(r.prefix));
  if (!match) return true;
  if (match.req.superOnly && ctx.role !== "super_admin") return false;
  if (match.req.perm && !hasPerm(ctx, match.req.perm)) return false;
  return true;
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-4 py-20">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-card border shadow-sm">
        <ShieldCheck className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Your role doesn't have permission to view this page. If you think this is a mistake, please contact a Super Admin.
      </p>
      <Link to="/admin" className="text-primary underline underline-offset-4 text-sm">
        Return to admin dashboard
      </Link>
    </div>
  );
}





function crumbsFor(pathname: string): { label: string; href?: string }[] {
  const base = [{ label: "Admin", href: "/admin" }];
  if (pathname === "/admin" || pathname === "/admin/") return [{ label: "Dashboard" }];
  // direct match
  if (TITLE_MAP[pathname]) return [...base, { label: TITLE_MAP[pathname] }];
  // /admin/tickets/:id
  if (pathname.startsWith("/admin/tickets/")) {
    return [...base, { label: "Support inbox", href: "/admin/tickets" }, { label: "Ticket" }];
  }
  if (pathname.startsWith("/admin/users/")) {
    return [...base, { label: "Users", href: "/admin/users" }, { label: "User" }];
  }
  return [...base, { label: "Page" }];
}

function AdminSidebar({ ctx }: { ctx: StaffContext }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b">
        <Link to="/admin" className="flex items-center gap-2.5 px-2 py-2 group">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">Shootbase</span>
              <span className="truncate text-[11px] text-muted-foreground">Admin console</span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-2">
        {NAV_SECTIONS.map((section) => {
          const visible = section.items.filter((n) => {
            if (n.superOnly && ctx.role !== "super_admin") return false;
            return !n.perm || hasPerm(ctx, n.perm);
          });
          if (visible.length === 0) return null;
          return (
            <SidebarGroup key={section.label} className="py-1.5">
              {!collapsed && (
                <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/60">
                  {section.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {visible.map((item) => {
                    const active =
                      pathname === item.url ||
                      (item.url !== "/admin" && pathname.startsWith(item.url));
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.title}
                          className="h-10 rounded-md px-3 text-[13.5px] text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:font-semibold data-[active=true]:shadow-sm"
                        >
                          <Link to={item.url} className="flex items-center gap-3">
                            <item.icon className="h-[18px] w-[18px] shrink-0" />
                            <span className="truncate">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t p-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Open account menu"
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {(ctx.role ?? "A").slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-xs font-medium">{ROLE_LABEL[ctx.role!]}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {ctx.permissions.length} permissions
                  </span>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{ROLE_LABEL[ctx.role!]}</span>
                <span className="text-[11px] text-muted-foreground">Admin console</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <SignOutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const fetchCtx = useServerFn(getMyStaffContext);
  const { data: ctx, isLoading } = useQuery<StaffContext>({
    queryKey: ["staff-context"],
    queryFn: async () => {
      try {
        return (await fetchCtx()) as StaffContext;
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? "");
        if (msg.includes("Unauthorized") || msg.includes("401")) {
          return { isStaff: false } as StaffContext;
        }
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Skeleton className="h-10 w-10 rounded-full" />
          <span className="text-sm">Loading admin console…</span>
        </div>
      </div>
    );
  }
  if (!ctx?.isStaff) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-muted/30">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-card border shadow-sm">
          <ShieldCheck className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold">Admin access required</h1>
        <p className="text-muted-foreground max-w-md">
          Your account does not have access to the Shootbase admin area.
        </p>
        <Link to="/" className="text-primary underline underline-offset-4">Return home</Link>
      </div>
    );
  }

  const crumbs = crumbsFor(pathname);

  return (
    <StaffCtx.Provider value={ctx}>
      <AdminCountryProvider staff={ctx}>
      <SidebarProvider style={{ "--sidebar-width": "15.5rem" } as React.CSSProperties}>
        <div className="min-h-screen flex w-full bg-muted/30 overflow-x-hidden">
          <AdminSidebar ctx={ctx} />
          <div className="flex-1 flex flex-col min-w-0 max-w-full">
            <header className="h-14 border-b bg-card/80 backdrop-blur-md flex items-center px-2 sm:px-3 md:px-5 gap-2 sm:gap-3 sticky top-0 z-30">
              <SidebarTrigger className="-ml-1 shrink-0" />
              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0 flex-1 overflow-hidden">
                {crumbs.map((c, i) => (
                  <span key={i} className="flex items-center gap-1.5 min-w-0">
                    {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />}
                    {c.href ? (
                      <Link
                        to={c.href}
                        className="truncate text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {c.label}
                      </Link>
                    ) : (
                      <span className="truncate font-medium text-foreground">{c.label}</span>
                    )}
                  </span>
                ))}
              </nav>
              <Badge variant="outline" className="hidden md:inline-flex gap-1.5 font-normal shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {ROLE_LABEL[ctx.role!]}
              </Badge>
              <CountrySwitcher />
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-full"
                    aria-label="Open account menu"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {(ctx.role ?? "A").slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{ROLE_LABEL[ctx.role!]}</span>
                      <span className="text-[11px] text-muted-foreground">Admin console</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <SignOutMenuItem />
                </DropdownMenuContent>
              </DropdownMenu>
            </header>
            <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 max-w-full min-w-0 overflow-x-hidden animate-in fade-in duration-200">
              <div className="mx-auto w-full max-w-[1400px] min-w-0">
                {isPathAllowed(pathname, ctx) ? children : <AccessDenied />}
              </div>
            </main>
          </div>
        </div>
      </SidebarProvider>
      </AdminCountryProvider>
    </StaffCtx.Provider>
  );
}

export function AdminPage({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between sm:items-center">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function PermissionGate({
  perm,
  children,
  fallback = null,
}: {
  perm: StaffPermission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const ctx = useStaff();
  return hasPerm(ctx, perm) ? <>{children}</> : <>{fallback}</>;
}
