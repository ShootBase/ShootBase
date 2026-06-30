import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site/Header";
import { SiteFooter } from "@/components/site/Footer";
import { detectCountryCode, PREVIEW_COUNTRY_KEY, type CountryCode } from "@/lib/country-detect";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/why-shootbase")({
  head: () => ({
    meta: [
      { title: "Why ShootBase — A creative marketplace built for photographers, videographers & clients" },
      { name: "description", content: "Discover why clients and creative professionals choose ShootBase: verified pros, fast project matching, secure messaging and country-wide coverage." },
      { property: "og:title", content: "Why ShootBase" },
      { property: "og:description", content: "A creative-focused marketplace built for photographers, videographers and clients." },
    ],
    links: [{ rel: "canonical", href: "/why-shootbase" }],
  }),
  component: WhyPage,
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

function Card({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="bg-white border border-[#EAE5DD] rounded-2xl p-6 hover:shadow-[0_20px_50px_-25px_rgba(22,22,22,0.2)] hover:-translate-y-0.5 transition-all">
      <div className="text-2xl mb-3">{emoji}</div>
      <div className="text-base font-semibold text-[#161616] mb-1.5">{title}</div>
      <p className="text-sm text-[#666666] leading-relaxed">{desc}</p>
    </div>
  );
}

function WhyPage() {
  const country = useCountry();
  const coverage = country === "NG" ? "Nigeria-wide Coverage" : "UK-wide Coverage";
  const countryName = country === "NG" ? "Nigeria" : "the UK";

  return (
    <div className="bg-[#FAF8F4] text-[#161616] min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 sm:px-6 lg:px-8 pt-12 md:pt-20 pb-10 md:pb-14">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-block text-[10px] uppercase tracking-[0.2em] text-[#C79A5A] font-semibold mb-4">Why ShootBase</div>
            <h1 className="font-display text-4xl md:text-6xl leading-[1.05] tracking-tight text-balance">
              A creative marketplace,{" "}
              <span className="italic text-[#C79A5A]">built differently.</span>
            </h1>
            <p className="mt-5 text-base md:text-lg text-[#666666] max-w-2xl mx-auto leading-relaxed">
              ShootBase connects clients with verified photographers, videographers and content creators across {countryName}. Fast matching, secure messaging, and a platform designed specifically for creative work.
            </p>
          </div>
        </section>

        {/* Clients */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 md:py-16 bg-white border-y border-[#EAE5DD]">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-display text-2xl md:text-4xl text-[#161616] mb-2">Why clients choose ShootBase</h2>
            <p className="text-sm md:text-base text-[#666666] mb-8 max-w-2xl">Hire the right creative professional with confidence.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              <Card emoji="✅" title="Verified Creative Professionals" desc="Every professional is checked, so you can hire with confidence." />
              <Card emoji="🔒" title="Secure Messaging" desc="Chat directly with professionals safely inside ShootBase." />
              <Card emoji="⚡" title="Fast Project Matching" desc="Post your project and receive responses from suitable pros quickly." />
              <Card emoji="📍" title={coverage} desc={`Find trusted creative professionals across ${countryName}.`} />
              <Card emoji="⭐" title="Built for creative work" desc="Designed specifically for photographers, videographers and content creators." />
            </div>
            <div className="mt-8">
              <Link to="/for-clients" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#161616] hover:text-[#C79A5A]">
                More for clients <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* Pros */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-display text-2xl md:text-4xl text-[#161616] mb-2">Why professionals choose ShootBase</h2>
            <p className="text-sm md:text-base text-[#666666] mb-8 max-w-2xl">Grow your creative business on a platform designed for you.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              <Card emoji="🚀" title="Grow your creative business" desc="Get discovered by clients actively looking to hire." />
              <Card emoji="📈" title="Get matched with projects" desc="Receive relevant opportunities that match your services." />
              <Card emoji="💬" title="Secure messaging" desc="Communicate with clients safely inside the platform." />
              <Card emoji="⭐" title="Built for creatives" desc="A marketplace designed specifically for creative professionals." />
              <Card emoji="🌍" title={`Work across ${countryName}`} desc={`Discover ${country === "NG" ? "Nigeria" : "UK"}-wide opportunities in your area and beyond.`} />
            </div>
            <div className="mt-8">
              <Link to="/for-professionals" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#161616] hover:text-[#C79A5A]">
                More for professionals <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 sm:px-6 lg:px-8 pb-16">
          <div className="max-w-4xl mx-auto bg-[#161616] text-white rounded-3xl p-8 md:p-12 text-center">
            <h3 className="font-display text-2xl md:text-4xl mb-3">Ready to get started?</h3>
            <p className="text-white/70 max-w-xl mx-auto mb-6 text-sm md:text-base">Post a project for free, or join as a professional and start receiving opportunities.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/for-clients" className="px-6 py-3 rounded-full bg-[#C79A5A] hover:bg-[#b6884a] text-white text-sm font-semibold transition-colors">Post a Project</Link>
              <Link to="/for-professionals" className="px-6 py-3 rounded-full border border-white/20 hover:border-[#C79A5A] hover:text-[#C79A5A] text-sm font-semibold transition-colors">Join as a Professional</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
