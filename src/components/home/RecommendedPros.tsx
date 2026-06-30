import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Star,
  MapPin,
  BadgeCheck,
  Heart,
  ChevronRight,
  ShieldCheck,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { ProAvatar } from "@/components/pro/ProAvatar";
import {
  getRecommendedProsForClient,
  toggleFavourite,
  myFavourites,
} from "@/lib/marketplace.functions";
import { myPostedLeads } from "@/lib/leads.functions";
import { requestProContact, myRequestedProIds } from "@/lib/contact-requests.functions";
import { detectCountryCode } from "@/lib/country-detect";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Pro = Awaited<ReturnType<typeof getRecommendedProsForClient>>[number];

export function RecommendedPros({ className = "" }: { className?: string }) {
  const [pros, setPros] = useState<Pro[] | null>(null);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [openPro, setOpenPro] = useState<Pro | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    const country = (typeof window !== "undefined" ? detectCountryCode() : "GB") as "GB" | "NG";
    let cancelled = false;
    void getRecommendedProsForClient({ data: { country, limit: 12 } })
      .then((rows) => {
        if (!cancelled) setPros(rows);
      })
      .catch(() => {
        if (!cancelled) setPros([]);
      });
    void myFavourites()
      .then((rows) => {
        if (cancelled) return;
        const s = new Set<string>();
        for (const r of rows as any[]) if (r?.id) s.add(r.id);
        setFavs(s);
      })
      .catch(() => {});
    void myPostedLeads()
      .then((rows) => {
        if (cancelled) return;
        const open = (rows as any[]).filter(
          (j) => j?.status === "open" && new Date(j.expires_at) > new Date(),
        );
        if (open.length > 0) setActiveJobId(open[0].id);
      })
      .catch(() => {});
    void myRequestedProIds()
      .then((ids) => {
        if (!cancelled) setRequestedIds(new Set(ids));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function onRequestContact(p: Pro) {
    if (requestedIds.has(p.id)) return;
    if (!activeJobId) {
      toast.error("Post a project first to request contact.");
      return;
    }
    setBusyId(p.id);
    try {
      const res = await requestProContact({
        data: { job_id: activeJobId, professional_id: p.id },
      });
      setRequestedIds((prev) => new Set(prev).add(p.id));
      toast.success(
        res.was_new
          ? "Contact requested. The professional has been notified."
          : "You've already requested this professional.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request");
    } finally {
      setBusyId(null);
    }
  }

  async function onFav(e: MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const next = new Set(favs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFavs(next);
    try {
      await toggleFavourite({ data: { professional_id: id } });
    } catch {
      toast.error("Could not update favourites");
    }
  }

  function scrollByX(dx: number) {
    scroller.current?.scrollBy({ left: dx, behavior: "smooth" });
  }

  function handleSelect(p: Pro) {
    if (isMobile) {
      void navigate({ to: "/pro/$slug", params: { slug: p.slug } });
    } else {
      setOpenPro(p);
    }
  }

  return (
    <section
      className={`relative rounded-3xl bg-white border border-ink/8 shadow-[0_2px_24px_-12px_rgba(0,0,0,0.08)] p-4 sm:p-5 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="inline-grid place-items-center h-9 w-9 rounded-xl bg-brass/15 text-brass shrink-0">
            <Star className="w-4 h-4" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-brass font-medium">
              Recommended Pros
            </p>
            <p className="text-[11px] text-ink/55 mt-0.5 truncate">
              {isMobile ? "Tap a pro to view profile" : "Click a pro for details"}
            </p>
          </div>
        </div>
        <Link
          to="/client/recommended-pros"
          className="hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] border border-ink/15 rounded-full px-2.5 py-1.5 hover:border-brass transition-colors shrink-0"
        >
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Body */}
      {pros === null ? (
        <div className="grid place-items-center text-xs text-ink/50 py-6">
          Finding professionals…
        </div>
      ) : pros.length === 0 ? (
        <div className="grid place-items-center text-center py-4">
          <div>
            <Sparkles className="w-5 h-5 text-brass mx-auto mb-2" />
            <p className="text-sm text-ink/65 mb-3">No recommended professionals yet.</p>
            <Link
              to="/browse"
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] bg-ink text-paper px-4 py-2 rounded-full hover:bg-brass transition-colors"
            >
              Browse Professionals <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="relative">
          <div
            ref={scroller}
            className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth snap-x snap-mandatory no-scrollbar"
            style={{ scrollbarWidth: "none" }}
          >
            {pros.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p)}
                className="group relative snap-start shrink-0 w-[84px] sm:w-[112px] rounded-2xl bg-paper border border-ink/8 hover:border-brass/50 hover:shadow-[0_6px_22px_-12px_rgba(200,155,60,0.45)] transition-all overflow-hidden text-left"
              >
                <div className="relative aspect-square bg-ink/5 overflow-hidden">
                  {p.cover_image_url || p.avatar_path ? (
                    <img
                      src={p.cover_image_url ?? `/api/public/avatar/${p.id}`}
                      alt={p.business_name}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center">
                      <ProAvatar
                        proId={p.id}
                        hasAvatar={!!p.avatar_path}
                        name={p.business_name}
                        size="lg"
                        shape="square"
                      />
                    </div>
                  )}
                  <span
                    onClick={(e) => onFav(e, p.id)}
                    role="button"
                    aria-label={favs.has(p.id) ? "Remove from favourites" : "Add to favourites"}
                    className="absolute top-1 right-1 h-6 w-6 grid place-items-center rounded-full bg-white/95 backdrop-blur hover:bg-white shadow-sm cursor-pointer"
                  >
                    <Heart
                      className={`w-3 h-3 transition-colors ${
                        favs.has(p.id) ? "fill-rose-500 text-rose-500" : "text-ink/55"
                      }`}
                      strokeWidth={1.8}
                    />
                  </span>
                  {p.available && (
                    <span className="absolute bottom-1 left-1 inline-flex items-center text-[9px] font-medium text-emerald-700 bg-white/95 backdrop-blur px-1.5 py-0.5 rounded-full">
                      • Available
                    </span>
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <div className="flex items-center gap-1 min-w-0">
                    <p className="font-display text-[12px] text-ink leading-tight truncate">
                      {p.business_name}
                    </p>
                    {p.is_verified && (
                      <BadgeCheck className="w-3 h-3 text-brass shrink-0" />
                    )}
                  </div>
                  <p className="hidden sm:block text-[10px] text-ink/55 leading-none mt-0.5 truncate">
                    {p.profession || "Creative pro"}
                  </p>
                  {p.rating_count > 0 && (
                    <div className="hidden sm:flex items-center gap-0.5 mt-1 text-[10px] text-ink/65">
                      <Star className="w-2.5 h-2.5 text-brass fill-brass" />
                      <span className="tabular-nums font-medium">
                        {p.rating_avg.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => scrollByX(320)}
            aria-label="Scroll right"
            className="hidden md:grid absolute right-0 top-[42%] -translate-y-1/2 place-items-center h-8 w-8 rounded-full bg-white border border-ink/10 shadow hover:border-brass hover:text-brass transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Footer trust strip */}
      <div className="mt-3 pt-2.5 border-t border-ink/8 flex items-center justify-between gap-2 text-[10px] text-ink/55">
        <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
          <ShieldCheck className="w-3 h-3 text-brass shrink-0" />
          <span className="truncate">All professionals are verified.</span>
        </span>
        <Link
          to="/client/recommended-pros"
          className="sm:hidden inline-flex items-center gap-1 text-ink/60 hover:text-brass shrink-0"
        >
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Desktop detail modal */}
      <Dialog open={!!openPro && !isMobile} onOpenChange={(o) => !o && setOpenPro(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          {openPro && (
            <>
              <div className="relative h-32 bg-gradient-to-br from-champagne/40 to-brass/20">
                {openPro.cover_image_url && (
                  <img
                    src={openPro.cover_image_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="px-5 sm:px-6 pb-5 sm:pb-6 -mt-10 relative">
                <div className="h-20 w-20 rounded-2xl overflow-hidden border-4 border-white shadow-md bg-white">
                  <ProAvatar
                    proId={openPro.id}
                    hasAvatar={!!openPro.avatar_path}
                    name={openPro.business_name}
                    size="lg"
                    shape="square"
                  />
                </div>
                <DialogHeader className="mt-3 text-left space-y-1">
                  <DialogTitle className="font-display text-xl text-ink flex items-center gap-1.5">
                    {openPro.business_name}
                    {openPro.is_verified && (
                      <BadgeCheck className="w-4 h-4 text-brass" />
                    )}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-ink/60">
                    {openPro.profession || "Creative pro"}
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-ink/65">
                  {openPro.city && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" strokeWidth={1.7} />
                      {openPro.city}
                    </span>
                  )}
                  {openPro.rating_count > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-brass fill-brass" />
                      <span className="font-medium text-ink tabular-nums">
                        {openPro.rating_avg.toFixed(1)}
                      </span>
                      <span className="text-ink/45">({openPro.rating_count})</span>
                    </span>
                  )}
                  {openPro.available && (
                    <span className="inline-flex items-center text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      • Available
                    </span>
                  )}
                </div>

                {openPro.services.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {openPro.services.slice(0, 6).map((s) => (
                      <span
                        key={s}
                        className="text-[11px] bg-ink/[0.05] text-ink/70 px-2 py-0.5 rounded-md"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-5">
                  {(() => {
                    const requested = requestedIds.has(openPro.id);
                    const busy = busyId === openPro.id;
                    return (
                      <button
                        type="button"
                        onClick={() => onRequestContact(openPro)}
                        disabled={requested || busy || !activeJobId}
                        className="inline-flex items-center gap-1.5 bg-ink text-paper px-4 py-2.5 rounded-full text-[11px] uppercase tracking-[0.16em] font-medium hover:bg-brass transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {requested ? "Contact requested ✓" : busy ? "Sending…" : (<>Request Contact <ArrowRight className="w-3 h-3" /></>)}
                      </button>
                    );
                  })()}
                  <Link
                    to="/pro/$slug"
                    params={{ slug: openPro.slug }}
                    onClick={() => setOpenPro(null)}
                    className="inline-flex items-center gap-1.5 bg-paper border border-ink/15 text-ink px-4 py-2.5 rounded-full text-[11px] uppercase tracking-[0.16em] font-medium hover:border-brass hover:text-brass transition-colors"
                  >
                    View Full Profile
                  </Link>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
