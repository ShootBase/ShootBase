import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft, BadgeCheck, Star, MapPin, Search, ChevronRight,
  Sparkles, ShieldCheck, Clock,
} from "lucide-react";
import { SiteHeader } from "@/components/site/Header";
import { DashboardFooter } from "@/components/site/DashboardFooter";
import { ClientMobileNav } from "@/components/site/ClientMobileNav";
import { ProAvatar } from "@/components/pro/ProAvatar";
import { getRecommendedProsForClient } from "@/lib/marketplace.functions";
import { myPostedLeads } from "@/lib/leads.functions";
import { requestProContact, myRequestedProIds } from "@/lib/contact-requests.functions";
import { detectCountryCode } from "@/lib/country-detect";

const searchSchema = z.object({ jobId: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/client/recommended-pros")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Recommended Professionals — Shootbase" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecommendedProsPage,
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen grid place-items-center bg-paper p-6 text-center">
      <div>
        <p className="text-ink/70 mb-3">Couldn't load recommendations.</p>
        <p className="text-xs text-ink/50 mb-4">{error.message}</p>
        <button onClick={reset} className="text-[11px] uppercase tracking-[0.18em] bg-ink text-paper px-4 py-2 rounded-full">
          Try again
        </button>
      </div>
    </div>
  ),
});

type Pro = Awaited<ReturnType<typeof getRecommendedProsForClient>>[number];
type Job = { id: string; title: string; status: string; expires_at: string; city: string | null };

function RecommendedProsPage() {
  const navigate = useNavigate();
  const { jobId: jobIdParam } = Route.useSearch();
  const [pros, setPros] = useState<Pro[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(jobIdParam ?? null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const country = (typeof window !== "undefined" ? detectCountryCode() : "GB") as "GB" | "NG";

  useEffect(() => {
    let cancelled = false;
    void getRecommendedProsForClient({ data: { country, limit: 24 } })
      .then((rows) => { if (!cancelled) setPros(rows); })
      .catch(() => { if (!cancelled) setPros([]); });
    void myPostedLeads().then((rows) => {
      if (cancelled) return;
      const j = (rows as Job[]).filter((x) => x.status === "open" && new Date(x.expires_at) > new Date());
      setJobs(j);
      if (!selectedJobId && j.length > 0) setSelectedJobId(j[0].id);
    }).catch(() => {});
    void myRequestedProIds()
      .then((ids) => { if (!cancelled) setRequestedIds(new Set(ids)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [country]);

  const cities = useMemo(() => {
    const s = new Set<string>();
    (pros ?? []).forEach((p) => { if (p.city) s.add(p.city); });
    return Array.from(s).sort();
  }, [pros]);

  const services = useMemo(() => {
    const s = new Set<string>();
    (pros ?? []).forEach((p) => p.services.forEach((sv) => s.add(sv)));
    return Array.from(s).sort();
  }, [pros]);

  const filtered = useMemo(() => {
    return (pros ?? []).filter((p) => {
      if (verifiedOnly && !p.is_verified) return false;
      if (cityFilter && (p.city ?? "").toLowerCase() !== cityFilter.toLowerCase()) return false;
      if (serviceFilter && !p.services.some((s) => s.toLowerCase() === serviceFilter.toLowerCase())) return false;
      if (q.trim()) {
        const needle = q.toLowerCase();
        const hay = `${p.business_name} ${p.profession} ${p.city ?? ""} ${p.services.join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [pros, q, cityFilter, serviceFilter, verifiedOnly]);

  async function onRequestContact(p: Pro) {
    if (requestedIds.has(p.id)) return;
    if (!selectedJobId) {
      toast.error("Select a project first, or post a new project.");
      return;
    }
    setBusyId(p.id);
    try {
      const res = await requestProContact({ data: { job_id: selectedJobId, professional_id: p.id } });
      setRequestedIds((prev) => new Set(prev).add(p.id));
      toast.success(
        res.was_new
          ? "Contact requested. The professional has been notified and can respond through ShootBase."
          : "You've already requested this professional for this project.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="dashboard-readable flex-1 pb-28 md:pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
          <button
            onClick={() => navigate({ to: "/dashboard" })}
            className="inline-flex items-center gap-1.5 text-xs text-ink/60 hover:text-brass mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </button>

          <header className="mb-5 sm:mb-6">
            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-brass font-medium mb-2">
              For you
            </p>
            <h1 className="font-display text-3xl sm:text-4xl text-ink leading-tight">
              Recommended Professionals
            </h1>
            <p className="text-sm sm:text-base text-ink/60 mt-1.5 max-w-2xl">
              Professionals matched to your project, location and requirements.
            </p>
          </header>

          {/* Project selector */}
          <div className="rounded-3xl bg-white border border-ink/8 p-4 sm:p-5 mb-4 sm:mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-[11px] uppercase tracking-[0.18em] text-ink/55 sm:min-w-[120px]">
                Request for project
              </label>
              {jobs.length === 0 ? (
                <div className="flex-1 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-ink/60">You don't have an active project yet.</p>
                  <Link
                    to="/dashboard"
                    className="text-[11px] uppercase tracking-[0.18em] bg-ink text-paper px-3 py-2 rounded-full hover:bg-brass transition-colors"
                  >
                    Post a project
                  </Link>
                </div>
              ) : (
                <select
                  value={selectedJobId ?? ""}
                  onChange={(e) => setSelectedJobId(e.target.value || null)}
                  className="flex-1 min-w-0 rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-brass"
                >
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}{j.city ? ` · ${j.city}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-3xl bg-white border border-ink/8 p-4 sm:p-5 mb-5 sm:mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by name, service…"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-ink/15 bg-white focus:outline-none focus:border-brass"
                />
              </div>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-ink/15 bg-white focus:outline-none focus:border-brass"
              >
                <option value="">All locations</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-ink/15 bg-white focus:outline-none focus:border-brass"
              >
                <option value="">All services</option>
                {services.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-ink/15 cursor-pointer hover:border-brass">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => setVerifiedOnly(e.target.checked)}
                  className="accent-brass"
                />
                <span className="text-sm text-ink/75">Verified only</span>
              </label>
            </div>
          </div>

          {/* Results */}
          {pros === null ? (
            <div className="grid place-items-center py-20 text-sm text-ink/50">Finding professionals…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl bg-white border border-dashed border-ink/15 p-12 text-center">
              <Sparkles className="w-6 h-6 text-brass mx-auto mb-3" />
              <p className="text-sm text-ink/60 mb-4">No matching professionals.</p>
              <Link to="/browse" className="text-[11px] uppercase tracking-[0.18em] bg-ink text-paper px-4 py-2 rounded-full hover:bg-brass transition-colors">
                Browse all
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filtered.map((p) => {
                const requested = requestedIds.has(p.id);
                return (
                  <article key={p.id} className="rounded-3xl bg-white border border-ink/8 shadow-[0_2px_18px_-12px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col">
                    <div className="relative aspect-[16/10] bg-ink/5">
                      {p.cover_image_url ? (
                        <img src={p.cover_image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-champagne/30 to-brass/10">
                          <ProAvatar proId={p.id} hasAvatar={!!p.avatar_path} name={p.business_name} size="lg" shape="square" />
                        </div>
                      )}
                      {p.available && (
                        <span className="absolute top-2 left-2 inline-flex items-center text-[10px] font-medium text-emerald-700 bg-white/95 backdrop-blur px-2 py-0.5 rounded-full">
                          • Available
                        </span>
                      )}
                      {p.is_verified && (
                        <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-medium text-brass bg-white/95 backdrop-blur px-2 py-0.5 rounded-full">
                          <BadgeCheck className="w-3 h-3" /> Verified
                        </span>
                      )}
                    </div>
                    <div className="p-4 sm:p-5 flex-1 flex flex-col">
                      <h3 className="font-display text-lg text-ink leading-tight truncate">{p.business_name}</h3>
                      <p className="text-xs text-ink/55 mt-0.5">{p.profession || "Creative pro"}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-ink/65">
                        {p.city && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {p.city}
                          </span>
                        )}
                        {p.rating_count > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Star className="w-3 h-3 text-brass fill-brass" />
                            <span className="font-medium text-ink tabular-nums">{p.rating_avg.toFixed(1)}</span>
                            <span className="text-ink/45">({p.rating_count})</span>
                          </span>
                        )}
                      </div>
                      {p.services.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {p.services.slice(0, 4).map((s) => (
                            <span key={s} className="text-[10px] bg-ink/[0.05] text-ink/70 px-2 py-0.5 rounded-md">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-auto pt-4 grid grid-cols-2 gap-2">
                        <Link
                          to="/pro/$slug"
                          params={{ slug: p.slug }}
                          className="inline-flex justify-center items-center text-[11px] uppercase tracking-[0.16em] border border-ink/15 px-3 py-2.5 rounded-full hover:border-brass hover:text-brass transition-colors"
                        >
                          View Profile
                        </Link>
                        <button
                          type="button"
                          onClick={() => onRequestContact(p)}
                          disabled={requested || busyId === p.id || !selectedJobId}
                          className="inline-flex justify-center items-center text-[11px] uppercase tracking-[0.16em] font-medium bg-ink text-paper px-3 py-2.5 rounded-full hover:bg-brass transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {requested ? "Contact requested ✓" : busyId === p.id ? "Sending…" : "Request Contact"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-ink/55">
            <ShieldCheck className="w-3.5 h-3.5 text-brass" />
            All professionals are verified by ShootBase.
          </div>
        </div>
      </main>
      <DashboardFooter />
      <ClientMobileNav />
    </div>
  );
}
