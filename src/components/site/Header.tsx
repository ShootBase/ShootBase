import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useRole } from "@/lib/role-context";
import { ProAvatar } from "@/components/pro/ProAvatar";
import { ShootbaseLogo } from "@/components/site/Logo";
import { performSignOut } from "@/lib/auth-signout";

import { ChevronDown } from "lucide-react";

export function SiteHeader({ landingNav }: { landingNav?: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const { activeRole, proSlug, profile } = useRole();
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!accountOpen) return;
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-account-menu]")) setAccountOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [accountOpen]);

  async function signOut() {
    setAccountOpen(false);
    await performSignOut(queryClient);
    navigate({ to: "/", replace: true });
  }

  const isPro = activeRole === "professional";
  const isCustomer = activeRole === "customer";
  const dashTo = isPro ? "/pro/dashboard" : "/dashboard";
  const logoTo = user ? dashTo : "/";

  const roleLabel = isPro ? "Professional" : isCustomer ? "Client" : "Guest";
  const billingTo = isPro ? "/pro/credits" : "/dashboard";
  const messagesTo = isPro ? "/pro/responses" : "/customer/messages";
  const helpTo = isPro ? "/pro/help" : "/help";
  const settingsTo = isPro ? "/pro/settings" : "/account/settings";

  const avatarSrc = profile.avatarUrl ?? undefined;
  const avatarProId = !avatarSrc && isPro && profile.hasProAvatar ? profile.proId ?? undefined : undefined;
  const avatarHas = Boolean(avatarProId);
  const avatarShape: "circle" | "square" = isPro && profile.proAvatarKind === "logo" ? "square" : "circle";

  function ProfileButton({ onClick }: { onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        aria-expanded={accountOpen}
        className="inline-flex items-center gap-2 px-2 py-1 border border-ink/15 hover:border-gold transition-all max-w-[220px]"
      >
        <ProAvatar
          size="sm"
          shape={avatarShape}
          src={avatarSrc}
          proId={avatarProId}
          hasAvatar={avatarHas}
          name={profile.displayName}
        />
        <span className="text-sm font-medium truncate hidden sm:inline">{profile.displayName || "Account"}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
    );
  }

  function DropdownPanel({ onItemClick }: { onItemClick: () => void }) {
    return (
      <div className="absolute right-0 top-full mt-2 w-72 bg-paper border border-ink/10 shadow-xl z-50">
        <Link
          to="/profile"
          onClick={onItemClick}
          className="flex items-center gap-3 px-4 py-3 border-b border-ink/10 hover:bg-ink/5"
        >
          <ProAvatar
            size="md"
            shape={avatarShape}
            src={avatarSrc}
            proId={avatarProId}
            hasAvatar={avatarHas}
            name={profile.displayName}
          />
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{profile.displayName || "Account"}</div>
            <div className="text-[10px] uppercase tracking-widest text-ink/50 mt-0.5">{roleLabel}</div>
          </div>
        </Link>
        <div className="flex flex-col py-2 text-sm">
          <Link to={dashTo} onClick={onItemClick} className="px-4 py-2.5 hover:bg-ink/5">Dashboard</Link>
          {isCustomer && (
            <>
              <Link to="/customer/post-lead" onClick={onItemClick} className="px-4 py-2.5 hover:bg-ink/5">Post a Job</Link>
              <Link to="/dashboard" hash="my-jobs" onClick={onItemClick} className="px-4 py-2.5 hover:bg-ink/5">My Jobs</Link>
              <Link to="/customer/messages" onClick={onItemClick} className="px-4 py-2.5 hover:bg-ink/5">Messages</Link>
            </>
          )}
          {isPro && (
            <>
              <Link to="/pro/leads" onClick={onItemClick} className="px-4 py-2.5 hover:bg-ink/5">Projects Marketplace</Link>
              <Link to="/pro/responses" onClick={onItemClick} className="px-4 py-2.5 hover:bg-ink/5">Messages</Link>
              <Link to="/customer/post-lead" onClick={onItemClick} className="px-4 py-2.5 hover:bg-ink/5">Post a Job (Hire)</Link>
            </>
          )}
          {isPro && proSlug ? (
            <Link to="/pro/$slug" params={{ slug: proSlug }} onClick={onItemClick} className="px-4 py-2.5 hover:bg-ink/5">My Profile</Link>
          ) : (
            <Link to="/profile" onClick={onItemClick} className="px-4 py-2.5 hover:bg-ink/5">My Profile</Link>
          )}
          <Link to={settingsTo} onClick={onItemClick} className="px-4 py-2.5 hover:bg-ink/5">Account Settings</Link>
          {isPro && (
            <Link to={billingTo} onClick={onItemClick} className="px-4 py-2.5 hover:bg-ink/5">Billing & Subscription</Link>
          )}
          <div className="border-t border-ink/10 my-1" />
          <Link to={helpTo} onClick={onItemClick} className="px-4 py-2.5 hover:bg-ink/5">Help & Support</Link>
          <button onClick={signOut} className="text-left px-4 py-2.5 hover:bg-ink/5 text-ink/70">Logout</button>
        </div>
      </div>
    );
  }

  return (
    <nav className="sticky top-0 z-50 bg-paper/85 backdrop-blur-md border-b border-ink/5 px-6 py-0 flex justify-between items-center gap-4">
      <Link to={logoTo} className="shrink-0">
        <ShootbaseLogo className="h-20 sm:h-24 md:h-28 w-auto" />
      </Link>

      {user ? (
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <div className="relative" data-account-menu>
            <ProfileButton onClick={() => setAccountOpen((v) => !v)} />
            {accountOpen && <DropdownPanel onItemClick={() => setAccountOpen(false)} />}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex items-center gap-4 shrink-0">
          {landingNav}
        </div>
      )}

      {/* Mobile */}
      <div className="md:hidden flex items-center gap-2">
        {user && (
          <div className="relative" data-account-menu>
            <ProfileButton onClick={() => setAccountOpen((v) => !v)} />
            {accountOpen && <DropdownPanel onItemClick={() => setAccountOpen(false)} />}
          </div>
        )}
      </div>

    </nav>
  );
}
