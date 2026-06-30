import { createFileRoute, notFound, Link, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { MapPin, Star, CalendarDays, Timer, Clock, Check } from "lucide-react";
import { getProBySlug } from "@/lib/marketplace.functions";
import { getProContactInfo } from "@/lib/reviews.functions";
import {
  getRequestableJobsForPro,
  myRequestedProIds,
  requestProContact,
  type RequestableJob,
} from "@/lib/contact-requests.functions";
import { SiteHeader } from "@/components/site/Header";
import { SiteFooter } from "@/components/site/Footer";
import { ProShell } from "@/components/site/ProShell";
import { formatPence } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import { cn } from "@/lib/utils";
import { ProAvatar } from "@/components/pro/ProAvatar";
import { SocialLinks } from "@/components/pro/SocialLinks";
import { useRole } from "@/lib/role-context";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";
import { PortfolioGallery } from "@/components/portfolio/PortfolioGallery";
import { ProfileVideoGallery } from "@/components/site/ProfileVideoGallery";

export const Route = createFileRoute("/pro/$slug")({
  loader: async ({ params }) => {
    if (params.slug === "invoices") throw redirect({ to: "/create-invoice" });
    const pro = await getProBySlug({ data: { slug: params.slug } });
    if (!pro) throw notFound();
    return pro;
  },
  head: ({ loaderData, params }) => {
    const title = loaderData ? `${loaderData.business_name} — Shootbase` : "Professional";
    return {
      meta: [
        { title },
        { name: "description", content: loaderData?.about?.slice(0, 160) ?? "View this UK professional on Shootbase." },
        { property: "og:title", content: title },
        { property: "og:url", content: `/pro/${params.slug}` },
        ...(loaderData?.cover_image_url ? [{ property: "og:image", content: loaderData.cover_image_url }] : []),
      ],
      links: [{ rel: "canonical", href: `/pro/${params.slug}` }],
    };
  },
  component: ProProfile,
});

type Contact = {
  website: string | null; instagram: string | null; facebook: string | null;
  tiktok: string | null; linkedin: string | null; twitter: string | null; youtube: string | null;
};

function ProProfile() {
  const pro = Route.useLoaderData();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [contact, setContact] = useState<null | Contact>(null);
  const { proSlug } = useRole();
  const isOwner = proSlug === pro.slug;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        getProContactInfo({ data: { pro_id: pro.id } }).then(setContact).catch(() => setContact(null));
      }
    });
    if (typeof window !== "undefined" && pro.slug && !isOwner) {
      try { localStorage.setItem("shootbase.ref", pro.slug); } catch {}
    }
  }, [pro.id, pro.slug, isOwner]);

  const nationwide = (pro as { nationwide_service?: boolean }).nationwide_service;
  const radius = (pro as { service_radius_miles?: number }).service_radius_miles;
  const memberSince = (pro as { created_at?: string | null }).created_at;
  const responseRate = (pro as { response_rate_pct?: number | null }).response_rate_pct;
  const avgResponse = (pro as { avg_response_minutes?: number | null }).avg_response_minutes;

  const proCountry = (pro as { country?: string | null }).country ?? "United Kingdom";
  const isNG = proCountry === "Nigeria";
  const radiusValue = radius ? (isNG ? Math.round(radius * 1.609344) : radius) : null;
  const unitWord = isNG ? "km" : "miles";
  const nationwideLabel = isNG ? "Serves clients across Nigeria" : "Serves clients nationwide";
  const serviceTagline = nationwide
    ? nationwideLabel
    : radiusValue && radiusValue > 0
      ? `Travels up to ${radiusValue} ${unitWord}${pro.city ? ` from ${pro.city}` : ""}`
      : null;

  const body = (
    <>
      {isOwner && (
        <div className="bg-gold/10 border-b border-gold/30 px-4 py-3 text-center text-[11px] uppercase tracking-widest text-ink/80">
          You are viewing your public profile.{" "}
          <Link to="/pro/settings" className="underline hover:text-gold">Edit profile</Link>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="grid lg:grid-cols-[1fr_360px] gap-6 lg:gap-8">
          <div className="space-y-5 sm:space-y-6">
            {/* Header card */}
            <section className="rounded-3xl bg-white/70 border border-ink/5 px-5 sm:px-8 py-6 sm:py-8 shadow-sm">
              <div className="grid grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)] items-start gap-5 sm:gap-7">
                <div className="shrink-0">
                  <div className="rounded-full overflow-hidden ring-1 ring-ink/5">
                    <ProAvatar
                      proId={pro.id}
                      hasAvatar={!!pro.avatar_path}
                      name={pro.business_name}
                      size="xl"
                      className="!h-[88px] !w-[88px] sm:!h-[120px] sm:!w-[120px] !border-0"
                    />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
                    <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl leading-tight truncate">
                      {pro.business_name}
                    </h1>
                    {contact && (
                      <SocialLinks
                        website={contact.website}
                        instagram={contact.instagram}
                        facebook={contact.facebook}
                        tiktok={contact.tiktok}
                        linkedin={contact.linkedin}
                        twitter={contact.twitter}
                        youtube={contact.youtube}
                        size={20}
                      />
                    )}
                    {pro.is_verified && (
                      <span className="bg-gold/10 text-gold text-[10px] px-2 py-1 font-mono uppercase rounded">Verified</span>
                    )}
                  </div>
                  <p className="flex items-center flex-wrap gap-x-2 gap-y-1 text-sm text-ink/60">
                    <MapPin className="w-4 h-4 shrink-0" strokeWidth={1.6} />
                    <span>{pro.city || "—"}</span>
                    {pro.years_experience ? (
                      <>
                        <span className="text-ink/30">•</span>
                        <span>{pro.years_experience} Years Experience</span>
                      </>
                    ) : null}
                  </p>
                  {serviceTagline && (
                    <div className="mt-3 sm:mt-4">
                      <span className="inline-flex items-center gap-2 rounded-xl bg-paper border border-ink/5 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-ink/80">
                        <Star className="w-3.5 h-3.5 text-gold" strokeWidth={1.8} />
                        {serviceTagline}
                      </span>
                    </div>
                  )}
                  {!isOwner && !contact && (
                    <p className="mt-3 text-[10px] font-mono uppercase tracking-widest text-ink/40">
                      Contact details revealed once the professional unlocks your project.
                    </p>
                  )}
                </div>
              </div>

              {pro.about && (
                <div className="mt-6 pt-6 border-t border-ink/5">
                  <p className="text-ink/80 leading-relaxed whitespace-pre-line text-[15px]">{pro.about}</p>
                </div>
              )}


            </section>

            {/* Portfolio Gallery — primary showcase */}
            {pro.portfolio_items?.length > 0 && (
              <section className="rounded-3xl bg-white/70 border border-ink/5 px-5 sm:px-8 py-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-2xl">Portfolio Gallery</h2>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-ink/40">
                    {pro.portfolio_items.length} {pro.portfolio_items.length === 1 ? "image" : "images"}
                  </span>
                </div>
                <PortfolioGallery
                  items={pro.portfolio_items as { id: string; image_url: string; caption: string | null }[]}
                  businessName={pro.business_name}
                />
              </section>
            )}

            <ProfileVideoGallery professionalId={pro.id} />


            {/* Reviews */}
            <ReviewsSection proId={pro.id} isOwner={isOwner} />

            {/* Services card */}
            {pro.professional_services?.length > 0 && (
              <section className="rounded-3xl bg-white/70 border border-ink/5 px-5 sm:px-8 py-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-2xl">Services</h2>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {pro.professional_services.map((ps: { services: { id: string; name: string } | null }) =>
                    ps.services ? (
                      <span
                        key={ps.services.id}
                        className="rounded-full border border-ink/10 bg-paper px-4 py-2 text-sm text-ink/85"
                      >
                        {ps.services.name}
                      </span>
                    ) : null,
                  )}
                </div>
              </section>
            )}

            {/* Stats card */}
            <section className="rounded-3xl bg-white/70 border border-ink/5 px-4 sm:px-8 py-6 shadow-sm">
              <div className="grid grid-cols-3 divide-x divide-ink/5">
                <StatBlock icon={CalendarDays} label="Member since" value={formatMemberSince(memberSince)} />
                <StatBlock icon={Timer} label="Response rate" value={responseRate != null ? `${responseRate}%` : "—"} />
                <StatBlock icon={Clock} label="Avg response" value={formatAvgMinutes(avgResponse)} />
              </div>
            </section>

          </div>

          {/* Desktop sidebar */}
          <aside className="hidden lg:block lg:sticky lg:top-24 self-start rounded-3xl bg-white/70 border border-ink/5 p-6 shadow-sm">
            <p className="text-[10px] font-mono uppercase text-gold mb-2">Starting from</p>
            <p className="font-display text-3xl mb-6">{formatPence(pro.starting_price_pence)}</p>
            {isOwner ? (
              <OwnerPreview />
            ) : user ? (
              <RequestContactButton professionalId={pro.id} businessName={pro.business_name} />
            ) : (
              <Link
                to="/customer/post-lead"
                className="block text-center bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold rounded-full"
              >
                Post a project
              </Link>
            )}
            <p className="mt-6 text-xs text-ink/50">Contact details are shared once the professional unlocks your project.</p>
          </aside>
        </div>
      </div>

    </>
  );

  if (isOwner) {
    return <ProShell>{body}</ProShell>;
  }

  return (
    <div className="bg-paper min-h-screen">
      <SiteHeader />
      {body}
      <SiteFooter />
    </div>
  );
}

function OwnerPreview() {
  return (
    <div className="border border-dashed border-ink/20 p-4 text-xs text-ink/60 space-y-2 rounded-xl">
      <p className="font-mono uppercase tracking-widest text-[10px] text-gold">Client view preview</p>
      <p>This is where clients can request contact from you against one of their posted projects.</p>
    </div>
  );
}

function StatBlock({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="px-2 sm:px-4 text-center">
      <Icon className="w-4 h-4 mx-auto mb-2 text-ink/40" strokeWidth={1.6} />
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink/50 mb-1.5">{label}</p>
      <p className="font-display text-base sm:text-lg">{value}</p>
    </div>
  );
}

function formatMemberSince(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM yyyy");
  } catch {
    return "—";
  }
}

function formatAvgMinutes(mins?: number | null): string {
  if (mins == null) return "—";
  if (mins < 60) return `${Math.round(mins)} min`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)} hrs`;
  return `${Math.round(hrs / 24)} d`;
}

function RequestContactButton({ professionalId, businessName }: { professionalId: string; businessName: string }) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<RequestableJob[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [requestedJobs, setRequestedJobs] = useState<Set<string>>(new Set());
  const [proAlreadyRequested, setProAlreadyRequested] = useState(false);
  const anyRequested =
    proAlreadyRequested ||
    requestedJobs.size > 0 ||
    (jobs?.some((j) => j.already_requested) ?? false);

  useEffect(() => {
    void myRequestedProIds()
      .then((ids) => {
        if (ids.includes(professionalId)) setProAlreadyRequested(true);
      })
      .catch(() => {});
  }, [professionalId]);

  useEffect(() => {
    if (!open || jobs !== null) return;
    void getRequestableJobsForPro({ data: { professional_id: professionalId } })
      .then((rows) => {
        setJobs(rows);
        setRequestedJobs(new Set(rows.filter((r) => r.already_requested).map((r) => r.id)));
      })
      .catch(() => setJobs([]));
  }, [open, jobs, professionalId]);

  async function submit(jobId: string) {
    if (requestedJobs.has(jobId)) return;
    setBusyId(jobId);
    console.log("Request Contact clicked", { professionalId, jobId });
    try {
      const res = await requestProContact({ data: { job_id: jobId, professional_id: professionalId } });
      console.log("Contact request created", res);
      console.log("Notification created", { professionalId, jobId });
      setRequestedJobs((s) => new Set(s).add(jobId));
      toast.success(
        res.was_new
          ? "Request sent. The professional has been notified."
          : "You've already requested this professional for that project.",
      );
    } catch (e) {
      console.error("Request Contact failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Could not send request");
    } finally {
      setBusyId(null);
    }
  }

  const openJobs = (jobs ?? []).filter((j) => j.status !== "closed");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full px-6 py-3 text-xs uppercase tracking-widest font-medium rounded-full transition-colors",
          anyRequested
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "bg-ink text-paper hover:bg-gold",
        )}
      >
        {anyRequested ? (
          <span className="inline-flex items-center justify-center gap-2"><Check className="w-3.5 h-3.5" /> Requested</span>
        ) : (
          "Request Contact"
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request contact from {businessName}</DialogTitle>
            <DialogDescription>
              Choose which of your posted projects you'd like to invite them to. They'll be notified instantly and can unlock your project to start a conversation.
            </DialogDescription>
          </DialogHeader>

          {jobs === null ? (
            <p className="text-sm text-ink/60 py-6 text-center">Loading your projects…</p>
          ) : openJobs.length === 0 ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-ink/70">You haven't posted a project yet.</p>
              <Link
                to="/customer/post-lead"
                className="inline-block bg-ink text-paper px-5 py-2.5 text-xs uppercase tracking-widest font-medium rounded-full hover:bg-gold"
                onClick={() => setOpen(false)}
              >
                Post a project
              </Link>
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {openJobs.map((j) => {
                const requested = requestedJobs.has(j.id) || j.already_requested;
                return (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => submit(j.id)}
                    disabled={requested || busyId === j.id}
                    className="w-full text-left border border-ink/10 rounded-xl p-3 hover:border-gold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-ink truncate">{j.title}</p>
                        <p className="text-xs text-ink/55 mt-0.5 truncate">
                          {[j.service_name, j.city, j.event_date ? format(new Date(j.event_date), "d MMM yyyy") : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest">
                        {requested ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="w-3 h-3" /> Requested</span>
                        ) : busyId === j.id ? (
                          "Sending…"
                        ) : (
                          <span className="text-gold">Select</span>
                        )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

