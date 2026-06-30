import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/Header";
import { SiteFooter } from "@/components/site/Footer";

export const Route = createFileRoute("/legal")({
  component: () => (
    <div className="bg-paper min-h-screen">
      <SiteHeader />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <nav className="text-[10px] uppercase tracking-widest text-ink/60 mb-8 flex flex-wrap gap-4">
          <Link to="/legal/privacy" className="hover:text-gold">Privacy</Link>
          <Link to="/legal/terms" className="hover:text-gold">Terms</Link>
          <Link to="/legal/cookies" className="hover:text-gold">Cookies</Link>
          <Link to="/legal/gdpr" className="hover:text-gold">GDPR</Link>
          <Link to="/legal/photographer-terms" className="hover:text-gold">Pro terms</Link>
          <Link to="/legal/customer-terms" className="hover:text-gold">Customer terms</Link>
        </nav>
        <div className="bg-gold/5 border border-gold/30 p-4 mb-8 text-xs text-ink/70">
          <strong>Draft — replace before launch.</strong> These pages are placeholders generated to satisfy the
          marketplace's legal-page footprint. Have a UK-qualified lawyer review and replace the copy before
          accepting real bookings or payments.
        </div>
        <Outlet />
      </div>
      <SiteFooter />
    </div>
  ),
});
