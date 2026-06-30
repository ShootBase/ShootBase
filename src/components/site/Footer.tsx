import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useRole } from "@/lib/role-context";
import { ShootbaseLogo } from "@/components/site/Logo";

export function SiteFooter() {
  const [user, setUser] = useState<User | null>(null);
  const { activeRole } = useRole();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const dashTo = activeRole === "professional" ? "/pro/dashboard" : "/dashboard";
  const logoTo = user ? dashTo : "/";

  return (
    <footer className="border-t border-ink/5 py-6 px-6 mt-12">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
        <Link to={logoTo} className="shrink-0" aria-label="Shootbase home">
          <ShootbaseLogo className="h-24 sm:h-28 md:h-32 w-auto" />
        </Link>
        <div className="flex gap-6 text-[10px] uppercase tracking-widest text-ink/50">
          <Link to="/legal/terms" className="hover:text-gold transition-colors">Terms &amp; Conditions</Link>
        </div>
        <div className="flex gap-6 text-[10px] uppercase tracking-widest text-ink/50">
          <Link to="/pro/help" className="hover:text-gold transition-colors">Help &amp; Support</Link>
        </div>
      </div>
    </footer>
  );
}
