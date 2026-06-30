import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Search, MapPin, ArrowRight, Users, ShieldCheck, Star, Globe2,
  Camera, Home as HomeIcon, Calendar, Video, Package, Plane,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { SiteHeader } from "@/components/site/Header";
import { WhyShootbaseMenu, WhyShootbaseMobileMenu } from "@/components/site/WhyShootbaseMenu";
import { SiteFooter } from "@/components/site/Footer";
import { PostJobModal } from "@/components/home/PostJobModal";
import { listServices, getRecentJobs } from "@/lib/marketplace.functions";
import { useRole } from "@/lib/role-context";
import { detectCountryCode, PREVIEW_COUNTRY_KEY } from "@/lib/country-detect";
import catWedding from "@/assets/cat-wedding.jpg";
import catProperty from "@/assets/cat-property.jpg";
import catEvents from "@/assets/cat-events.jpg";
import catCorporateVideo from "@/assets/cat-corporate-video.jpg";
import catProduct from "@/assets/cat-product.jpg";
import catDrone from "@/assets/cat-drone.jpg";
import mascotVideo from "@/assets/mascot-hero.mp4.asset.json";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shootbase — Hire UK Photographers & Videographers | Get Free Quotes" },
      {
        name: "description",
        content:
          "Post a job and receive free quotes from trusted UK photographers and videographers. Wedding, property, events, corporate, product and drone. 10,000+ jobs posted every month.",
      },
      { property: "og:title", content: "Shootbase — UK Photo & Video Marketplace" },
      { property: "og:description", content: "Post a job and receive free quotes from trusted UK photographers and videographers." },
      { property: "og:url", content: "/" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "/" },
    ],
  }),
  loader: async () => {
    // Recent jobs are fetched client-side once we know the active country
    // (UK vs Nigeria preview), so the loader only hydrates services here.
    const services = await listServices();
    return { services, recentJobs: [] as Awaited<ReturnType<typeof getRecentJobs>> };
  },
  component: Landing,
});

const CATEGORIES: Array<{ label: string; match: RegExp; img: string; Icon: typeof Camera }> = [
  { label: "Weddings", match: /wedding/i, img: catWedding, Icon: Camera },
  { label: "Property", match: /property|real\s*estate/i, img: catProperty, Icon: HomeIcon },
  { label: "Events", match: /event/i, img: catEvents, Icon: Calendar },
  { label: "Corporate", match: /corporate/i, img: catCorporateVideo, Icon: Video },
  { label: "Products", match: /product/i, img: catProduct, Icon: Package },
  { label: "Drone", match: /drone|aerial/i, img: catDrone, Icon: Plane },
];

const POPULAR_SEARCHES = [
  "Event Videography",
  "Corporate Headshots",
  "Drone Photography",
  "Product Photography",
  "Social Media Content",
];

const TESTIMONIALS = [
  {
    quote:
      "Found an incredible wedding photographer within a day. The quality of pros on Shootbase is excellent and the booking was seamless.",
    name: "Olivia Hartwell",
    location: "London",
    initial: "O",
  },
  {
    quote:
      "I needed property photography on short notice. Three quotes within hours and I hired a brilliant local pro the same afternoon.",
    name: "James Whitaker",
    location: "Manchester",
    initial: "J",
  },
  {
    quote:
      "Booked a corporate videographer for our brand launch. Professional from first message to final delivery. Couldn't recommend more.",
    name: "Priya Shah",
    location: "Birmingham",
    initial: "P",
  },
];

function Landing() {
  const { services } = Route.useLoaderData() as {
    services: Array<{ id: string; slug: string; name: string; kind: "photography" | "videography"; sort_order: number }>;
  };
  type RecentJob = {
    id: string;
    title: string;
    city: string;
    createdAt: string;
    kind: string;
    serviceSlug: string;
    serviceName: string;
    responseCount: number;
  };
  const [postOpen, setPostOpen] = useState(false);
  const [initialServiceId, setInitialServiceId] = useState<string | undefined>(undefined);
  const [countryCode, setCountryCode] = useState(() => detectCountryCode());
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const navigate = useNavigate();
  const { loaded, activeRole, roles } = useRole();

  // Re-render the homepage when the country preview override changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setCountryCode(detectCountryCode());
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREVIEW_COUNTRY_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
    };
  }, []);

  // Fetch recent jobs scoped to the active country — UK content must never
  // leak into Nigeria and vice versa.
  useEffect(() => {
    let cancelled = false;
    getRecentJobs({ data: { country: countryCode === "NG" ? "NG" : "GB" } })
      .then((jobs) => { if (!cancelled) setRecentJobs(jobs as RecentJob[]); })
      .catch(() => { if (!cancelled) setRecentJobs([]); });
    return () => { cancelled = true; };
  }, [countryCode]);



  // Signed-in users never see the marketing homepage — send them to their dashboard.
  useEffect(() => {
    if (!loaded) return;
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("postJob") === "resume") return; // let the resume handler run
    }
    if (activeRole === "professional" || roles.includes("professional")) {
      navigate({ to: "/pro/dashboard", replace: true });
    } else if (activeRole === "customer" || roles.includes("customer")) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loaded, activeRole, roles, navigate]);

  const goPostJob = (serviceId?: string) => {
    setInitialServiceId(serviceId);
    setPostOpen(true);
  };

  // Resume the job-posting modal after Google/Apple sign-in returns to
  // /?postJob=resume. We deliberately DO NOT publish here — the job is only
  // posted after the client explicitly clicks the Post Job button on step 3.
  // The PostJobModal's own resume effect rehydrates the saved draft.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("postJob") !== "resume") return;
    const draftRaw = sessionStorage.getItem("postJob:draft");
    url.searchParams.delete("postJob");
    window.history.replaceState({}, "", url.toString());
    if (!draftRaw) return;
    // Ensure the resume flag is present so PostJobModal restores the draft.
    if (sessionStorage.getItem("postJob:resume") !== "1") {
      sessionStorage.setItem("postJob:resume", "1");
    }
    setPostOpen(true);
    toast.success("You're signed in. Review your details and click Post Job to publish.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const goCategory = (match: RegExp) => {
    const svc = services.find((s) => match.test(s.name));
    goPostJob(svc?.id);
  };



  const goPro = () => {
    if (!loaded) return;
    if (activeRole === "professional" || roles.includes("professional")) {
      navigate({ to: "/pro/dashboard" });
      return;
    }
    navigate({ to: "/auth", search: { as: "pro", redirect: "/pro/dashboard" } });
  };

  return (
    <div className="bg-[#FAF8F4] text-[#161616] min-h-screen flex flex-col">
      <SiteHeader
        landingNav={
          <div className="hidden lg:flex items-center justify-center gap-6 border-l border-[#EAE5DD] pl-6 text-sm text-[#161616]/80">
            <WhyShootbaseMenu />
            <a href="#categories" className="hover:text-[#C79A5A] transition-colors">Categories</a>
            <a href="#reviews" className="hover:text-[#C79A5A] transition-colors">Reviews</a>
            <div className="h-4 w-px bg-[#EAE5DD]" />
            <button
              onClick={goPro}
              className="px-4 py-1.5 rounded-full border border-[#161616]/20 hover:border-[#C79A5A] hover:text-[#C79A5A] transition-colors text-sm font-medium"
            >
              For Professionals
            </button>
            <Link
              to="/client/login"
              className="px-4 py-1.5 rounded-full border border-[#161616]/20 hover:border-[#C79A5A] hover:text-[#C79A5A] transition-colors text-sm font-medium"
            >
              Login
            </Link>
            <button
              onClick={() => goPostJob()}
              className="px-4 py-1.5 rounded-full bg-[#C79A5A] text-white hover:bg-[#b6884a] transition-colors text-sm font-medium shadow-sm"
            >
              Post a Job
            </button>
          </div>
        }
      />

      {/* Mobile & tablet nav strip */}
      <div className="lg:hidden flex items-center justify-end gap-2 border-b border-[#EAE5DD] bg-[#FAF8F4]/90 backdrop-blur-sm px-4 py-2.5">
        <WhyShootbaseMobileMenu />
        <Link
          to="/client/login"
          className="px-3 py-1.5 rounded-full border border-[#161616]/20 text-xs font-medium"
        >
          Login
        </Link>
        <button
          onClick={goPro}
          className="px-3 py-1.5 rounded-full bg-[#C79A5A] text-white text-xs font-medium shadow-sm"
        >
          Professional
        </button>
      </div>

      <main className="flex-1">
        {/* HERO */}
        <section className="relative overflow-hidden bg-[#FAF8F4]">
          {/* Decorative mascot video is positioned below within the search card wrapper for desktop anchoring. */}

          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 md:pt-8 pb-4 md:pb-6 text-center">
            <h1 className="font-display text-[40px] sm:text-5xl md:text-6xl lg:text-[64px] leading-[1.05] tracking-tight text-[#161616] text-balance">
              Find the right{" "}
              <span className="italic text-[#C79A5A]">creative professional</span>
              <span className="block">for your project.</span>
            </h1>
            <p className="mt-4 md:mt-5 text-base md:text-lg text-[#666666] max-w-xl mx-auto leading-relaxed text-pretty">
              Photographers, videographers and creators, all in one place.
            </p>

            {/* Search card — desktop mascot is anchored to the right of this wrapper */}
            <div className="mt-6 md:mt-8 min-[1200px]:relative">
              <div className="bg-white rounded-2xl border border-[#EAE5DD] shadow-[0_10px_40px_-15px_rgba(22,22,22,0.15)] p-3 md:p-3 grid grid-cols-1 md:grid-cols-[1.9fr_1fr_auto] gap-2 md:gap-3 items-stretch text-left">
                <button
                  type="button"
                  onClick={() => goPostJob()}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#FAF8F4] transition-colors text-left w-full min-w-0"
                >
                  <Search className="w-5 h-5 text-[#C79A5A] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-wider text-[#161616] font-semibold whitespace-nowrap">
                      What creative service are you looking for?
                    </div>
                    <div className="text-sm text-[#666666] truncate">e.g. Event videography</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => goPostJob()}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#FAF8F4] transition-colors border-t md:border-t-0 md:border-l border-[#EAE5DD] text-left w-full min-w-0"
                >
                  <MapPin className="w-5 h-5 text-[#C79A5A] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-wider text-[#161616] font-semibold">Location</div>
                    <div className="text-sm text-[#666666] truncate">{countryCode === "NG" ? "e.g. Lagos" : "e.g. Manchester or M1"}</div>
                  </div>
                </button>
                <button
                  onClick={() => goPostJob()}
                  className="inline-flex items-center justify-center gap-2 bg-[#C79A5A] hover:bg-[#b6884a] text-white px-6 md:px-8 py-4 rounded-xl font-semibold text-sm md:text-base shadow-sm transition-colors whitespace-nowrap"
                >
                  Find Professionals
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Decorative mascot video — blended into hero background via mix-blend-mode */}
              <video
                src={mascotVideo.url}
                autoPlay
                muted
                loop
                playsInline
                preload="none"
                aria-hidden="true"
                tabIndex={-1}
                style={{ mixBlendMode: "multiply", background: "transparent" }}
                className="pointer-events-none select-none absolute right-2 sm:right-4 lg:right-10 top-1/2 -translate-y-1/2 w-[140px] sm:w-[200px] md:w-[260px] lg:w-[340px] xl:w-[380px] h-auto opacity-90 motion-reduce:hidden z-0 min-[1200px]:absolute min-[1200px]:left-full min-[1200px]:right-auto min-[1200px]:top-1/2 min-[1200px]:-translate-y-1/2"
              />
            </div>

            {/* Popular searches */}
            <div className="mt-3 md:mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-[#666666]">Popular searches:</span>
              {POPULAR_SEARCHES.map((s) => (
                <button
                  key={s}
                  onClick={() => goPostJob()}
                  className="text-xs px-3 py-2 rounded-full bg-white border border-[#EAE5DD] text-[#161616]/80 hover:border-[#C79A5A] hover:text-[#C79A5A] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* CATEGORIES */}
        <section id="categories" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 md:pt-4 pb-14 md:pb-20">
          <div className="text-center mb-10 md:mb-14">
            <h2 className="font-display text-3xl md:text-5xl text-[#161616]">Popular categories</h2>
            <p className="mt-3 text-[#666666] text-sm md:text-base">Tap a category to get free quotes from trusted UK pros.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            {CATEGORIES.map((c) => (
              <button
                key={c.label}
                onClick={() => goCategory(c.match)}
                className="group text-left rounded-2xl overflow-hidden bg-white border border-[#EAE5DD] shadow-[0_4px_20px_-12px_rgba(22,22,22,0.1)] hover:shadow-[0_14px_40px_-18px_rgba(22,22,22,0.25)] hover:-translate-y-1 transition-all duration-300"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[#F5EADA]">
                  <img
                    src={c.img}
                    alt={c.label}
                    width={800}
                    height={600}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="p-4 md:p-5 flex items-center gap-3">
                  <span className="grid place-items-center w-10 h-10 rounded-full bg-[#F5EADA] shrink-0">
                    <c.Icon className="w-4 h-4 text-[#C79A5A]" strokeWidth={1.8} />
                  </span>
                  <div className="font-display text-lg text-[#161616] leading-snug">{c.label}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="bg-white border-y border-[#EAE5DD]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
            <div className="text-center mb-12 md:mb-16">
              <h2 className="font-display text-3xl md:text-5xl text-[#161616]">How it works</h2>
              <p className="mt-3 text-[#666666] text-sm md:text-base">Three simple steps to hire with confidence.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8 md:gap-12 max-w-5xl mx-auto">
              {[
                { n: 1, title: "Post your job", body: "Tell us what you need in under 2 minutes." },
                { n: 2, title: "Receive quotes", body: "Get responses from trusted professionals." },
                { n: 3, title: "Hire the best", body: "Compare and hire with complete confidence." },
              ].map((s) => (
                <div key={s.n} className="text-center">
                  <div className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-[#F5EADA] border border-[#EAE5DD] mb-5">
                    <span className="font-display text-2xl text-[#C79A5A]">{s.n}</span>
                  </div>
                  <h3 className="font-display text-xl text-[#161616]">{s.title}</h3>
                  <p className="mt-2 text-sm text-[#666666] leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RECENTLY POSTED JOBS */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
          <div className="text-center mb-8 md:mb-10">
            <h2 className="font-display text-3xl md:text-5xl text-[#161616]">Recently posted jobs</h2>
            <p className="mt-3 text-[#666666] text-sm md:text-base">
              {countryCode === "NG"
                ? "Live activity from clients across Nigeria."
                : "Live activity from clients across the UK."}
            </p>
          </div>
          {recentJobs.length === 0 ? (
            <div className="rounded-2xl border border-[#EAE5DD] bg-white p-10 text-center text-[#666666]">
              {countryCode === "NG"
                ? "No projects posted in Nigeria yet."
                : "No projects posted in the UK in the last 14 days."}
            </div>

          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
              {recentJobs.slice(0, 8).map((j) => {
                const created = new Date(j.createdAt);
                const isNew = Date.now() - created.getTime() < 1000 * 60 * 60 * 24;
                return (
                  <div
                    key={j.id}
                    className="rounded-2xl bg-white border border-[#EAE5DD] p-5 hover:border-[#C79A5A] hover:shadow-[0_10px_30px_-15px_rgba(22,22,22,0.18)] transition-all"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase tracking-wider text-[#C79A5A] font-semibold">
                        {j.serviceName || j.title}
                      </span>
                      {isNew && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#2E7D32] font-semibold">
                          New
                        </span>
                      )}
                    </div>
                    <div className="font-display text-lg text-[#161616] leading-snug truncate">{j.city}</div>
                    <div className="mt-2 text-xs text-[#666666]">
                      Posted {formatDistanceToNow(created, { addSuffix: true })}
                    </div>
                    <div className="mt-1 text-[11px] text-[#999999]">
                      {format(created, "d MMM yyyy")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* TESTIMONIALS */}
        <section id="reviews" className="bg-white border-y border-[#EAE5DD]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
            <div className="text-center mb-12 md:mb-16">
              <h2 className="font-display text-3xl md:text-5xl text-[#161616]">Trusted by thousands of clients</h2>
              <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[#666666]">
                <div className="flex">
                  {[0,1,2,3,4].map((i) => (
                    <Star key={i} className="w-4 h-4 fill-[#C79A5A] text-[#C79A5A]" />
                  ))}
                </div>
                Rated 4.9/5 from 1,200+ reviews
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-5 md:gap-6">
              {TESTIMONIALS.map((t) => (
                <figure
                  key={t.name}
                  className="rounded-2xl bg-[#FAF8F4] border border-[#EAE5DD] p-6 md:p-7 flex flex-col"
                >
                  <div className="flex mb-4">
                    {[0,1,2,3,4].map((i) => (
                      <Star key={i} className="w-4 h-4 fill-[#C79A5A] text-[#C79A5A]" />
                    ))}
                  </div>
                  <blockquote className="text-[#161616] leading-relaxed text-[15px] flex-1">
                    "{t.quote}"
                  </blockquote>
                  <figcaption className="mt-5 flex items-center gap-3">
                    <span className="grid place-items-center w-10 h-10 rounded-full bg-[#C79A5A] text-white font-semibold">
                      {t.initial}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-[#161616]">{t.name}</div>
                      <div className="text-xs text-[#666666]">{t.location}</div>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* PRO CTA */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
          <div className="rounded-3xl border border-[#EAE5DD] bg-gradient-to-br from-white via-[#FAF8F4] to-[#F5EADA]/60 p-8 md:p-14 grid md:grid-cols-[1.4fr_1fr] gap-10 md:gap-14 items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#C79A5A] font-semibold mb-4">For professionals</p>
              <h2 className="font-display text-3xl md:text-5xl text-[#161616] leading-tight">
                Are you a photographer or videographer?
              </h2>
              <p className="mt-4 text-[#666666] leading-relaxed max-w-lg">
                Join thousands of professionals receiving new projects every day. Grow your business on your terms.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Receive qualified, ready-to-hire projects",
                  "Grow your business across the UK",
                  "Set your own prices and availability",
                ].map((b) => (
                  <li key={b} className="flex items-start gap-3 text-sm text-[#161616]">
                    <span className="grid place-items-center w-5 h-5 rounded-full bg-[#C79A5A] text-white text-[10px] mt-0.5 shrink-0">
                      ✓
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="md:justify-self-end">
              <button
                onClick={goPro}
                className="inline-flex items-center justify-center gap-2 bg-[#161616] hover:bg-[#C79A5A] text-white px-8 py-5 rounded-full font-semibold shadow-[0_15px_40px_-15px_rgba(199,154,90,0.5)] transition-colors"
              >
                Join as a Professional
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </main>

      <PostJobModal services={services} open={postOpen} onOpenChange={setPostOpen} initialServiceId={initialServiceId} />
      <SiteFooter />
    </div>
  );
}
