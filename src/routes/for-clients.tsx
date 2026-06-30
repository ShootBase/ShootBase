import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site/Header";
import { SiteFooter } from "@/components/site/Footer";
import { PostJobModal } from "@/components/home/PostJobModal";
import { detectCountryCode, PREVIEW_COUNTRY_KEY, type CountryCode } from "@/lib/country-detect";
import { listServices } from "@/lib/marketplace.functions";
import { ArrowRight, FileText, Users, Images, MessageSquare, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/for-clients")({
  head: () => ({
    meta: [
      { title: "For Clients — Hire verified creative professionals | ShootBase" },
      { name: "description", content: "Post a project on ShootBase and hear from verified photographers, videographers and creative professionals ready to bring your ideas to life." },
      { property: "og:title", content: "Hire creative professionals on ShootBase" },
      { property: "og:description", content: "Post a project for free and compare verified creative professionals." },
    ],
    links: [{ rel: "canonical", href: "/for-clients" }],
  }),
  loader: async () => ({ services: await listServices() }),
  component: ClientsPage,
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
  { icon: FileText, title: "Post your project for free", desc: "Tell us what you need — it only takes a couple of minutes." },
  { icon: Users, title: "Hear from verified professionals", desc: "Receive responses from creative pros suited to your project." },
  { icon: Images, title: "Compare creative portfolios", desc: "Review work samples, ratings and pricing all in one place." },
  { icon: MessageSquare, title: "Chat securely through ShootBase", desc: "Discuss details safely inside the platform — no contact details required upfront." },
  { icon: ShieldCheck, title: "Hire with confidence", desc: "Book the right professional knowing they've been verified." },
];

function ClientsPage() {
  const { services } = Route.useLoaderData() as { services: Array<{ id: string; name: string }> };
  const country = useCountry();
  const [postOpen, setPostOpen] = useState(false);
  
  const countryName = country === "NG" ? "Nigeria" : "the UK";

  return (
    <div className="bg-[#FAF8F4] text-[#161616] min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 sm:px-6 lg:px-8 pt-12 md:pt-20 pb-10 md:pb-14">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-block text-[10px] uppercase tracking-[0.2em] text-[#C79A5A] font-semibold mb-4">For Clients</div>
            <h1 className="font-display text-4xl md:text-6xl leading-[1.05] tracking-tight text-balance">
              Hire the right{" "}
              <span className="italic text-[#C79A5A]">creative professional</span>{" "}
              for your project.
            </h1>
            <p className="mt-5 text-base md:text-lg text-[#666666] max-w-2xl mx-auto leading-relaxed">
              When you post a project on ShootBase, you'll hear from verified creative professionals ready to help bring your ideas to life.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => setPostOpen(true)}
                className="px-6 py-3 rounded-full bg-[#C79A5A] hover:bg-[#b6884a] text-white text-sm font-semibold shadow-sm transition-colors"
              >
                Post a Project
              </button>
              <a
                href="#how-it-works"
                className="px-6 py-3 rounded-full border border-[#161616]/20 hover:border-[#C79A5A] hover:text-[#C79A5A] text-sm font-semibold transition-colors"
              >
                How it Works
              </a>
            </div>
            <p className="mt-4 text-xs text-[#666666]">Active across {countryName} · It's free to post a project.</p>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="px-4 sm:px-6 lg:px-8 py-12 md:py-16 bg-white border-y border-[#EAE5DD]">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-display text-2xl md:text-4xl text-[#161616] mb-8 text-center">How ShootBase works for clients</h2>
            <ol className="space-y-4 md:space-y-5">
              {STEPS.map(({ icon: Icon, title, desc }, i) => (
                <li key={title} className="bg-[#FAF8F4] border border-[#EAE5DD] rounded-2xl p-5 md:p-6 flex gap-4 md:gap-5">
                  <div className="shrink-0 flex flex-col items-center">
                    <span className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white border border-[#EAE5DD] flex items-center justify-center text-xs font-semibold text-[#C79A5A]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-[#C79A5A]" />
                      <div className="text-base md:text-lg font-semibold text-[#161616]">{title}</div>
                    </div>
                    <p className="text-sm text-[#666666] leading-relaxed">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-10 text-center">
              <button
                onClick={() => setPostOpen(true)}
                className="inline-flex items-center gap-1.5 px-6 py-3 rounded-full bg-[#C79A5A] hover:bg-[#b6884a] text-white text-sm font-semibold shadow-sm transition-colors"
              >
                Post a Project <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        <section className="px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="max-w-4xl mx-auto text-center">
            <h3 className="font-display text-2xl md:text-3xl mb-3">Looking to join as a professional?</h3>
            <p className="text-sm md:text-base text-[#666666] mb-6">Grow your creative business with ShootBase.</p>
            <Link to="/for-professionals" className="inline-flex items-center gap-1.5 px-6 py-3 rounded-full border border-[#161616]/20 hover:border-[#C79A5A] hover:text-[#C79A5A] text-sm font-semibold transition-colors">
              For Professionals <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
      <PostJobModal
        open={postOpen}
        onOpenChange={setPostOpen}
        services={services as never}
      />
    </div>
  );
}
