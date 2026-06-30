import { Link } from "@tanstack/react-router";
import { useRole } from "@/lib/role-context";
import { ShootbaseLogo } from "@/components/site/Logo";

export function DashboardFooter() {
  const { activeRole } = useRole();
  const dashTo = activeRole === "professional" ? "/pro/dashboard" : "/dashboard";
  return (
    <footer className="border-t border-ink/5 py-6 px-6 mt-12">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
        <Link to={dashTo} className="shrink-0" aria-label="Shootbase home">
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
