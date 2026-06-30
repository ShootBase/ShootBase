import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CitySelect } from "@/components/ui/city-select";
import { z } from "zod";
import { browseProfessionals, listServices, getMyProfile } from "@/lib/marketplace.functions";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site/Header";
import { SiteFooter } from "@/components/site/Footer";
import { formatPence, getBudgetBands } from "@/lib/format";
import { SocialLinks } from "@/components/pro/SocialLinks";
import { CardPortfolioStrip } from "@/components/pro/CardPortfolioStrip";


const browseSchema = z.object({
  city: z.string().optional(),
  q: z.string().optional(),
  serviceSlug: z.string().optional(),
  kind: z.enum(["photography", "videography"]).optional(),
  budget: z.string().optional(),
  minRating: z.coerce.number().optional(),
  country: z.enum(["GB", "NG"]).optional(),
});

export const Route = createFileRoute("/browse")({
  validateSearch: (s) => browseSchema.parse(s),
  loaderDeps: ({ search }) => search,
  head: () => ({
    meta: [
      { title: "Browse photographers & videographers — Shootbase" },
      { name: "description", content: "Browse vetted UK photography and videography professionals by location, category and budget." },
      { property: "og:title", content: "Browse pros — Shootbase" },
      { property: "og:url", content: "/browse" },
    ],
    links: [{ rel: "canonical", href: "/browse" }],
  }),
  loader: async ({ deps }) => {
    const [results, services] = await Promise.all([
      browseProfessionals({ data: deps }),
      listServices(),
    ]);
    return { results, services };
  },
  component: Browse,
});

type Result = {
  id: string;
  slug: string;
  business_name: string;
  city: string | null;
  cover_image_url: string | null;
  starting_price_pence: number | null;
  years_experience: number | null;
  is_verified: boolean;
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  youtube?: string | null;
  portfolio_items?: Array<{ id: string; image_url: string; display_order: number | null }>;
};


function Browse() {
  const navigate = useNavigate();
  const { results, services } = Route.useLoaderData() as {
    results: Result[];
    services: Array<{ id: string; slug: string; name: string; kind: "photography" | "videography" }>;
  };
  const search = Route.useSearch();
  const [city, setCity] = useState(search.city ?? "");

  // Keep the URL's `country` search param in sync with the active country so
  // the loader (server-side) filters pros to the right marketplace. Without
  // this, GB callers could see NG pros and vice versa.
  useEffect(() => {
    if (typeof window === "undefined") return;
    void import("@/lib/country-detect").then(({ detectCountryCode }) => {
      const code = detectCountryCode();
      if (search.country !== code) {
        navigate({ to: "/browse", search: { ...search, country: code }, replace: true });
      }
    });
  }, [search, navigate]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      void getMyProfile().then((me) => {
        if (me.profile?.account_type === "customer") {
          navigate({ to: "/customer/post-lead", replace: true });
        }
      }).catch(() => {});
    });
  }, [navigate]);

  return (
    <div className="bg-paper min-h-screen">
      <SiteHeader />
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="font-display text-4xl md:text-5xl mb-2">Browse professionals</h1>
        <p className="text-sm text-ink/60 mb-8">{results.length} result{results.length === 1 ? "" : "s"}</p>

        <form
          method="get"
          action="/browse"
          className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-10 bg-white border border-ink/10 p-2"
        >
          <div className="border-b md:border-b-0 md:border-r border-ink/10">
            <CitySelect
              value={city}
              onChange={setCity}
              name="city"
              className="border-0 px-4 py-3"
              placeholder="Any city"
            />
          </div>
          <select
            name="serviceSlug"
            defaultValue={search.serviceSlug ?? ""}
            className="px-4 py-3 text-sm focus:outline-none bg-transparent border-b md:border-b-0 md:border-r border-ink/10"
          >
            <option value="">All categories</option>
            {services.map((s) => (
              <option key={s.id} value={s.slug}>{s.name}</option>
            ))}
          </select>
          <select
            name="kind"
            defaultValue={search.kind ?? ""}
            className="px-4 py-3 text-sm focus:outline-none bg-transparent border-b md:border-b-0 md:border-r border-ink/10"
          >
            <option value="">Photo &amp; video</option>
            <option value="photography">Photography</option>
            <option value="videography">Videography</option>
          </select>
          <select
            name="budget"
            defaultValue={search.budget ?? ""}
            className="px-4 py-3 text-sm focus:outline-none bg-transparent border-b md:border-b-0 md:border-r border-ink/10"
          >
            <option value="">Any budget</option>
            {getBudgetBands().map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
          <button className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-bold hover:bg-gold">
            Search
          </button>
        </form>

        {results.length === 0 ? (
          <div className="border border-dashed border-ink/15 p-16 text-center">
            <p className="font-display text-2xl mb-2">No matches yet</p>
            <p className="text-sm text-ink/60">Try widening your filters, or check back as more pros join.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {results.map((p) => (
              <Link key={p.id} to="/pro/$slug" params={{ slug: p.slug }} className="group">
                <div className="mb-4">
                  <CardPortfolioStrip
                    items={p.portfolio_items ?? []}
                    coverUrl={p.cover_image_url}
                    businessName={p.business_name}
                  />
                </div>

                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-xl truncate">{p.business_name}</h3>
                      {p.is_verified && (
                        <span className="bg-gold/10 text-gold text-[9px] px-2 py-0.5 font-mono uppercase shrink-0">
                          Verified
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-ink/50 uppercase tracking-widest truncate">
                      {p.city ?? "United Kingdom"}{p.years_experience ? ` · ${p.years_experience} yrs exp` : ""}
                    </p>
                    <SocialLinks
                      website={p.website}
                      instagram={p.instagram}
                      facebook={p.facebook}
                      tiktok={p.tiktok}
                      linkedin={p.linkedin}
                      twitter={p.twitter}
                      youtube={p.youtube}
                      size={14}
                      className="mt-1"
                    />
                  </div>
                  <p className="font-mono text-sm shrink-0">{formatPence(p.starting_price_pence)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
