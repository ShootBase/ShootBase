import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site/Header";
import { SiteFooter } from "@/components/site/Footer";
import { detectCountryCode, PREVIEW_COUNTRY_KEY, type CountryCode } from "@/lib/country-detect";
import { useRole } from "@/lib/role-context";
import { ArrowRight, Inbox, Images, MessageSquare, ShieldCheck, FileText, Globe2 } from "lucide-react";

export const Route = createFileRoute("/for-professionals")({
  head: () => ({
    meta: [
      { title: "For Professionals — Grow your creative business | ShootBase" },
      { name: "description", content: "ShootBase helps photographers, videographers and creators discover new projects, connect with clients and grow their business." },
      { property: "og:title", content: "Grow your creative business on ShootBase" },
      { property: "og:description", content: "Discover new projects, connect with verified clients and grow your creative business." },
    ],
    links: [{ rel: "canonical", href: "/for-professionals" }],
  }),
  component: ProsPage,
});

function useCountry(): CountryCode {
  const [code, setCode] = useState<CountryCode>(() => (typeof window === "undefined" ? "GB" : detectCountryCode()));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setCode(detectCountryCode());
    const onStorage = (e: StorageEvent) => { if (e.key === PREVIEW_COUNTRY_KEY) sync(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
    };
  }, []);
  return code;
}

const STEPS = [
  { icon: Inbox, title: "Receive matching projects", desc: "Get notified about new projects that match your services and location." },
  { icon: Images, title: "Grow your portfolio", desc: "Showcase your best work and build a profile clients trust." },
  { icon: MessageSquare, title: "Secure messaging", desc: "Communicate with clients safely inside ShootBase." },
  { icon: ShieldCheck, title: "Verified clients", desc: "Engage with real clients who have posted real projects." },
  { icon: FileText, title: "Invoice tools", desc: "Send professional, branded invoices directly from your dashboard." },
  { icon: Globe2, title: "Country-wide opportunities", desc: "Discover projects in your city and across the country." },
];

function ProsPage() {
  const country = useCountry();
  const navigate = useNavigate();
  const { loaded, activeRole, roles } = useRole();
  const countryName = country === "NG" ? "Nigeria" : "the UK";

  const joinAsPro = () => {
    if (!loaded) return;
    if (activeRole === "professional" || roles.includes("professional")) {
      navigate({ to: "/pro/dashboard" });
      return;
    }
    navigate({ to: "/auth", search: { as: "pro", redirect: "/pro/dashboard" } });
  };

  return (
    <div className="bg-[#FAF8F4] text-[#161616] min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 sm:px-6 lg:px-8 pt-12 md:pt-20 pb-10 md:pb-14">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-block text-[10px] uppercase tracking-[0.2em] text-[#C79A5A] font-semibold mb-4">For Professionals</div>
            <h1 className="font-display text-4xl md:text-6xl leading-[1.05] tracking-tight text-balance">
              Grow your{" "}
              <span className="italic text-[#C79A5A]">creative business.</span>
            </h1>
            <p className="mt-5 text-base md:text-lg text-[#666666] max-w-2xl mx-auto leading-relaxed">
              ShootBase is a creative-focused marketplace that helps photographers, videographers and creators discover new projects, connect with clients and grow their business.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={joinAsPro}
                className="px-6 py-3 rounded-full bg-[#C79A5A] hover:bg-[#b6884a] text-white text-sm font-semibold shadow-sm transition-colors"
              >
                Join as a Professional
              </button>
              <a
                href="#how-it-works"
                className="px-6 py-3 rounded-full border border-[#161616]/20 hover:border-[#C79A5A] hover:text-[#C79A5A] text-sm font-semibold transition-colors"
              >
                How it Works
              </a>
            </div>
            <p className="mt-4 text-xs text-[#666666]">Built for creatives across {countryName}.</p>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="px-4 sm:px-6 lg:px-8 py-12 md:py-16 bg-white border-y border-[#EAE5DD]">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-display text-2xl md:text-4xl text-[#161616] mb-8 text-center">How ShootBase works for professionals</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              {STEPS.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="bg-[#FAF8F4] border border-[#EAE5DD] rounded-2xl p-5 md:p-6 hover:shadow-[0_20px_50px_-25px_rgba(22,22,22,0.2)] hover:-translate-y-0.5 transition-all">
                  <span className="w-10 h-10 rounded-lg bg-white border border-[#EAE5DD] flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-[#C79A5A]" />
                  </span>
                  <div className="text-base font-semibold text-[#161616] mb-1.5">{title}</div>
                  <p className="text-sm text-[#666666] leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <button
                onClick={joinAsPro}
                className="inline-flex items-center gap-1.5 px-6 py-3 rounded-full bg-[#C79A5A] hover:bg-[#b6884a] text-white text-sm font-semibold shadow-sm transition-colors"
              >
                Join as a Professional <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        <section className="px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="max-w-4xl mx-auto text-center">
            <h3 className="font-display text-2xl md:text-3xl mb-3">Looking to hire instead?</h3>
            <p className="text-sm md:text-base text-[#666666] mb-6">Find verified creative professionals for your project.</p>
            <Link to="/for-clients" className="inline-flex items-center gap-1.5 px-6 py-3 rounded-full border border-[#161616]/20 hover:border-[#C79A5A] hover:text-[#C79A5A] text-sm font-semibold transition-colors">
              For Clients <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
