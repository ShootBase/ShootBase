import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { BadgeCheck, Clock, MapPin, Zap, Star } from "lucide-react";

import { ProAvatar } from "@/components/pro/ProAvatar";
import {
  suggestProsForJob,
  requestProContact,
  type SuggestedPro,
} from "@/lib/contact-requests.functions";
import { detectCountryCode } from "@/lib/country-detect";

function badgeRespondsWithin(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `Usually responds within ${minutes} min`;
  const h = Math.round(minutes / 60);
  return `Usually responds within ${h} hour${h === 1 ? "" : "s"}`;
}

function isLikelyToRespond(p: SuggestedPro): boolean {
  return (p.response_rate_pct ?? 0) >= 70;
}

export function SuggestedPros({
  jobId,
  title = "Recommended Professionals",
  subtitle = "Pros matched to your job. Request contact to invite them — they'll be notified instantly.",
}: {
  jobId: string;
  title?: string;
  subtitle?: string;
}) {
  const [pros, setPros] = useState<SuggestedPro[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invited, setInvited] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setPros(null);
    void suggestProsForJob({ data: { job_id: jobId } })
      .then((rows) => {
        if (cancelled) return;
        setPros(rows);
        const map: Record<string, boolean> = {};
        for (const r of rows) if (r.already_invited) map[r.professional_id] = true;
        setInvited(map);
      })
      .catch(() => {
        if (!cancelled) setPros([]);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function request(p: SuggestedPro) {
    if (invited[p.professional_id]) return;
    setBusyId(p.professional_id);
    try {
      const res = await requestProContact({
        data: { job_id: jobId, professional_id: p.professional_id },
      });
      setInvited((prev) => ({ ...prev, [p.professional_id]: true }));
      toast.success(res.was_new ? "Your contact request has been sent successfully. The professional has been notified." : "You've already requested this professional.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send request");
    } finally {
      setBusyId(null);
    }
  }

  if (pros === null) {
    return (
      <section className="border border-ink/10 bg-white p-6">
        <h2 className="font-display text-2xl mb-1">{title}</h2>
        <p className="text-xs text-ink/55">Finding matching professionals…</p>
      </section>
    );
  }

  if (pros.length === 0) {
    return (
      <section className="border border-ink/10 bg-white p-6">
        <h2 className="font-display text-2xl mb-1">{title}</h2>
        <p className="text-sm text-ink/60 mt-2">
          We're still matching pros for this job. They'll appear here shortly — you can also wait
          for them to reach out from the Projects marketplace.
        </p>
      </section>
    );
  }

  return (
    <section>
      <header className="mb-4">
        <h2 className="font-display text-2xl sm:text-3xl text-ink leading-tight">{title}</h2>
        <p className="text-sm text-ink/60 mt-1 max-w-2xl">{subtitle}</p>
      </header>

      <div className="space-y-3">
        {pros.map((p) => {
          const wasInvited = !!invited[p.professional_id];
          const respondsBadge = badgeRespondsWithin(p.avg_response_minutes);
          const isNG = (typeof window !== "undefined" ? detectCountryCode() : "GB") === "NG";
          const distRaw = typeof p.distance_miles === "number" && p.distance_miles >= 0
            ? (isNG ? p.distance_miles * 1.609344 : p.distance_miles)
            : null;
          const dist = distRaw == null ? null : `${Math.round(distRaw)} ${isNG ? "km" : "mi"}`;
          const hasRating = !!(p.rating_count && p.rating_count > 0);
          return (
            <article
              key={p.professional_id}
              className="card-soft card-soft-hover p-4 sm:p-5"
            >
              {/* Top row: avatar · identity · CTAs */}
              <div className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-4">
                <ProAvatar
                  proId={p.professional_id}
                  hasAvatar={!!p.avatar_path}
                  name={p.business_name}
                  size="lg"
                  shape="square"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display text-xl sm:text-2xl text-ink leading-tight truncate">
                      {p.business_name || "Professional"}
                    </h3>
                    {p.is_verified && (
                      <span title="Verified" className="text-brass shrink-0">
                        <BadgeCheck className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-ink/65">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {p.city || "—"}
                    </span>
                    {dist && (<><span className="text-ink/25">·</span><span>{dist}</span></>)}
                    {p.service_name && (
                      <>
                        <span className="h-3 w-px bg-ink/15" />
                        <span className="inline-flex items-center text-[11px] font-medium bg-brass/10 text-brass px-2 py-0.5 rounded-full">
                          {p.service_name}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* CTAs — desktop right-aligned */}
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  <Link
                    to="/pro/$slug"
                    params={{ slug: p.slug }}
                    className="inline-flex items-center text-[11px] uppercase tracking-widest border border-ink/15 px-3 py-2 rounded-md hover:border-brass transition-colors"
                  >
                    View Profile
                  </Link>

                  <button
                    type="button"
                    onClick={() => request(p)}
                    disabled={wasInvited || busyId === p.professional_id}
                    className="inline-flex items-center text-[11px] uppercase tracking-widest font-medium bg-ink text-paper px-4 py-2 rounded-md hover:bg-brass transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    {wasInvited ? "Requested ✓" : busyId === p.professional_id ? "Sending…" : "Request Contact"}
                  </button>
                </div>
              </div>

              {/* Inline trust strip */}
              {(hasRating || respondsBadge || isLikelyToRespond(p)) && (
                <div className="mt-3 pt-3 border-t border-ink/8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink/70">
                  {hasRating && (
                    <span className="inline-flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 text-brass fill-brass" />
                      <span className="font-medium text-ink">{Number(p.rating_avg ?? 0).toFixed(1)}</span>
                      <span className="text-ink/50">({p.rating_count})</span>
                    </span>
                  )}
                  {respondsBadge && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-ink/50" />
                      {respondsBadge}
                    </span>
                  )}
                  {isLikelyToRespond(p) && (
                    <span className="inline-flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-brass" />
                      Likely to respond
                    </span>
                  )}
                </div>
              )}

              {/* Mobile CTAs */}
              <div className="sm:hidden mt-3 pt-3 border-t border-ink/8 grid grid-cols-2 gap-2">
                <Link
                  to="/pro/$slug"
                  params={{ slug: p.slug }}
                  className="inline-flex justify-center items-center text-[11px] uppercase tracking-widest border border-ink/15 px-3 py-2 rounded-md hover:border-brass transition-colors"
                >
                  View Profile
                </Link>

                <button
                  type="button"
                  onClick={() => request(p)}
                  disabled={wasInvited || busyId === p.professional_id}
                  className="inline-flex justify-center items-center text-[11px] uppercase tracking-widest font-medium bg-ink text-paper px-3 py-2 rounded-md hover:bg-brass transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {wasInvited ? "Requested ✓" : busyId === p.professional_id ? "Sending…" : "Request Contact"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
