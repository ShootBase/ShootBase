import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listServices, getMyProfile } from "@/lib/marketplace.functions";
import { myPostedLeads, pauseJob, repostJob } from "@/lib/leads.functions";
import { listCustomerThreads, type CustomerThread } from "@/lib/messages.functions";
import { budgetBandLabel } from "@/lib/format";
import { SiteHeader } from "@/components/site/Header";
import { DashboardFooter } from "@/components/site/DashboardFooter";
import { PostJobModal } from "@/components/home/PostJobModal";
import { ClientMobileNav } from "@/components/site/ClientMobileNav";
import { useRole } from "@/lib/role-context";
import { toast } from "sonner";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { JobInvitedProsToggle } from "@/components/contact-requests/JobInvitedProsToggle";
import { SuggestedPros } from "@/components/contact-requests/SuggestedPros";
import { RecommendedPros } from "@/components/home/RecommendedPros";
import { CloseJobModal } from "@/components/jobs/CloseJobModal";
import { myJobOutcomeStats, type JobOutcomeStats } from "@/lib/job-outcomes.functions";
import {
  Briefcase, MessageSquare, Users, Bell,
  ArrowRight, MapPin, Calendar, ChevronRight,
  FilePlus, FileText, Sparkles, CheckCircle2,
} from "lucide-react";
import { EmailVerificationBanner } from "@/components/account/EmailVerificationBanner";
import { PhoneVerificationBanner } from "@/components/account/PhoneVerificationBanner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

type Service = { id: string; slug: string; name: string; kind: "photography" | "videography"; sort_order: number };
type Job = {
  id: string;
  title: string;
  city: string;
  event_date: string | null;
  event_time: string | null;
  duration: string | null;
  duration_days: number | null;
  duration_start_date: string | null;
  duration_end_date: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  kind: string;
  budget_band: string | null;
  urgency: string | null;
  service: { name: string } | null;
  response_count: number;
  last_activity: string | null;
};

function budgetLabel(id: string | null): string {
  if (!id) return "—";
  return budgetBandLabel(id) ?? id;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatEventDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Dashboard() {
  const navigate = useNavigate();
  const { loaded, activeRole, roles } = useRole();
  const [name, setName] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [threads, setThreads] = useState<CustomerThread[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [postOpen, setPostOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<{ id: string; title: string } | null>(null);
  const [stats, setStats] = useState<JobOutcomeStats | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (activeRole === "professional") navigate({ to: "/pro/dashboard" });
  }, [loaded, activeRole, roles, navigate]);

  const load = () => {
    void Promise.all([myPostedLeads(), listCustomerThreads(), listServices(), getMyProfile(), myJobOutcomeStats()]).then(([j, t, s, me, st]) => {
      setJobs(j as Job[]);
      setThreads(t as CustomerThread[]);
      setServices(s as Service[]);
      setName(me.profile?.full_name ?? null);
      setStats(st as JobOutcomeStats);
    });
  };
  useEffect(load, []);

  useEffect(() => {
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? null;
      if (!userId) return;
      channel = supabase
        .channel(`dashboard-jobs-${userId}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `customer_id=eq.${userId}` }, () => load())
        .on("postgres_changes", { event: "*", schema: "public", table: "quote_requests", filter: `customer_id=eq.${userId}` }, () => load())
        .subscribe();
    });
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  const now = Date.now();
  const activeJobs = jobs.filter((j) => j.status === "open" && new Date(j.expires_at).getTime() > now).length;
  const draftJobs = jobs.filter((j) => j.status === "paused" || j.status === "draft").length;
  const closedJobs = jobs.filter((j) => j.status === "closed").length;
  const newResponses = threads.reduce((acc, t) => acc + t.unread_count, 0);
  const totalResponses = threads.length;
  const hiredCount = threads.filter((t) => t.hired).length;
  const conversations = new Set(threads.map((t) => t.qr_id)).size;

  const firstName = useMemo(() => (name ? name.trim().split(/\s+/)[0] : null), [name]);
  const dynamicHeadline = useMemo(() => {
    if (newResponses > 0) return `${newResponses} new ${newResponses === 1 ? "reply" : "replies"} from professionals`;
    if (totalResponses > 0) return `${totalResponses} ${totalResponses === 1 ? "professional has" : "professionals have"} responded to your jobs`;
    if (jobs.length === 0) return "Post your first project to start receiving responses";
    return "Manage your projects and find the right creative pros";
  }, [newResponses, totalResponses, jobs.length]);

  const recentJobs = useMemo(() => {
    const rank = (j: typeof jobs[number]) => {
      const expired = new Date(j.expires_at).getTime() < now;
      if (j.status === "closed") return 3;
      if (expired) return 2;
      if (j.status === "paused") return 1;
      return 0;
    };
    return [...jobs]
      .sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        return new Date(b.created_at ?? b.last_activity ?? 0).getTime() - new Date(a.created_at ?? a.last_activity ?? 0).getTime();
      })
      .slice(0, 6);
  }, [jobs, now]);

  async function onAction(action: "pause" | "repost", id: string) {
    try {
      if (action === "pause") await pauseJob({ data: { job_id: id } });
      if (action === "repost") await repostJob({ data: { job_id: id } });
      toast.success("Updated");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!loaded || (activeRole === "professional" && !roles.includes("customer"))) {
    return <div className="min-h-screen bg-paper" aria-hidden />;
  }

  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="dashboard-readable flex-1 pb-28 md:pb-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-8">
          <EmailVerificationBanner />
          <PhoneVerificationBanner />

          {/* Greeting */}
          <div className="mb-5 sm:mb-6">
            <h1 className="font-display text-[28px] sm:text-4xl text-ink leading-tight">
              {greeting()}, {firstName || "there"} <span aria-hidden>👋</span>
            </h1>
            <p className="text-sm sm:text-base text-ink/60 mt-1">{dynamicHeadline}</p>
          </div>

          {/* HERO + QUICK ACTIONS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 lg:gap-8 mb-5 sm:mb-6 items-start">
            <section className="lg:col-span-7 relative overflow-hidden rounded-3xl surface-noir p-6 sm:p-8 lg:p-10 min-h-[240px] flex flex-col justify-between animate-fade-in">
              <div className="blob animate-float-slow pointer-events-none" style={{ width: 320, height: 320, top: -120, right: -100, background: "radial-gradient(circle, #D4A574, transparent 60%)", opacity: 0.5 }} />
              <div className="relative max-w-md">
                <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.24em] text-champagne/80 mb-3">Your workspace</p>
                <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-paper leading-[1.05]">
                  Find the right <span className="italic text-gradient-champagne">creative pro</span> for your next project.
                </h2>
                <p className="text-sm text-paper/65 mt-3 leading-relaxed">
                  Post a project, compare responses and manage your conversations in one place.
                </p>
              </div>
              <div className="relative flex flex-wrap gap-2 mt-6">
                <button
                  onClick={() => setPostOpen(true)}
                  className="inline-flex items-center gap-2 bg-paper text-ink px-5 py-3 rounded-full text-[11px] uppercase tracking-[0.18em] font-medium hover:bg-champagne transition-all min-h-[44px]"
                >
                  {jobs.length === 0 ? "Post your first project" : "Post a project"} <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <Link to="/customer/messages" className="inline-flex items-center gap-2 bg-paper/10 text-paper border border-paper/20 px-5 py-3 rounded-full text-[11px] uppercase tracking-[0.18em] font-medium hover:bg-paper/20 transition-all min-h-[44px]">
                  Messages
                  {newResponses > 0 && <span className="bg-brass text-ink rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">{newResponses}</span>}
                </Link>
              </div>
            </section>

            {/* Recommended Pros card — compact, never stretches the workspace card */}
            <div className="lg:col-span-5">
              <RecommendedPros className="w-full" />
            </div>
          </div>

          {/* JOB STATUS OVERVIEW */}
          <section className="rounded-3xl bg-white border border-ink/8 shadow-[0_2px_24px_-12px_rgba(0,0,0,0.06)] p-5 sm:p-6 mb-5 sm:mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg sm:text-xl text-ink">Your jobs at a glance</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <StatTile Icon={Briefcase} label="Active jobs" value={activeJobs} href="/dashboard" hash="my-jobs" />
              <StatTile Icon={Users} label="Responses" value={totalResponses} href="/dashboard" hash="responses" />
              <StatTile Icon={MessageSquare} label="Unread" value={newResponses} href="/customer/messages" accent={newResponses > 0} />
              <StatTile Icon={CheckCircle2} label="Hired" value={hiredCount} href="/dashboard" hash="responses" />
            </div>
          </section>

          {/* RECENT JOBS */}
          <section id="my-jobs" className="mb-6 scroll-mt-20">
            <div className="flex items-center justify-between px-1 mb-3">
              <h2 className="font-display text-lg sm:text-xl text-ink">My recent jobs</h2>
              {jobs.length > recentJobs.length && (
                <Link to="/dashboard" hash="my-jobs" className="text-xs text-ink/55 hover:text-ink inline-flex items-center gap-1">
                  View all <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            {jobs.length === 0 ? (
              <div className="rounded-3xl bg-white border border-dashed border-ink/15 p-10 text-center">
                <Sparkles className="w-6 h-6 text-brass mx-auto mb-3" />
                <p className="text-sm text-ink/60 mb-4">You haven't posted any jobs yet.</p>
                <button
                  onClick={() => setPostOpen(true)}
                  className="text-[11px] uppercase tracking-[0.2em] bg-ink text-paper px-5 py-3 rounded-full hover:bg-brass transition-colors"
                >
                  Post your first project
                </button>
              </div>
            ) : (
              <div className="rounded-3xl bg-white border border-ink/8 shadow-[0_2px_24px_-12px_rgba(0,0,0,0.06)] overflow-hidden divide-y divide-ink/8">
                {recentJobs.map((j) => {
                  const expired = new Date(j.expires_at) < new Date();
                  const statusLabel = expired ? "Expired" : j.status === "open" ? "Live" : j.status === "paused" ? "Paused" : j.status === "closed" ? "Closed" : j.status;
                  const tone =
                    statusLabel === "Live" ? "bg-emerald-50 text-emerald-700"
                      : statusLabel === "Paused" ? "bg-amber-50 text-amber-700"
                      : statusLabel === "Closed" ? "bg-rose-50 text-rose-700"
                      : "bg-ink/5 text-ink/60";
                  return (
                    <Link
                      key={j.id}
                      to="/jobs/$id"
                      params={{ id: j.id }}
                      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-ink/[0.02] active:bg-ink/[0.04] transition-colors"
                    >
                      <div className="min-w-0">
                        <h3 className="font-display text-[17px] sm:text-xl text-ink leading-tight truncate group-hover:text-brass transition-colors">{j.title}</h3>
                        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-ink/55">
                          <MapPin className="w-3 h-3 shrink-0" strokeWidth={1.6} />
                          <span className="truncate">{j.city || "—"}</span>
                          {j.event_date && (
                            <>
                              <span className="text-ink/25">·</span>
                              <Calendar className="w-3 h-3 shrink-0" strokeWidth={1.6} />
                              <span className="truncate">{formatEventDate(j.event_date)}</span>
                            </>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center text-[10px] uppercase tracking-[0.14em] font-medium px-2 py-0.5 rounded-full ${tone}`}>{statusLabel}</span>
                          <UrgencyBadge urgency={j.urgency} />
                          <span className="text-[11px] text-ink/55 tabular-nums">
                            {j.response_count} {j.response_count === 1 ? "Response" : "Responses"}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-ink/30 shrink-0 group-hover:text-brass group-hover:translate-x-0.5 transition-all" />
                    </Link>
                  );
                })}
              </div>
            )}

            {jobs.length > 0 && (
              <details className="mt-3 group">
                <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.18em] text-ink/50 hover:text-ink inline-flex items-center gap-1 px-1">
                  Manage jobs <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                </summary>
                <div className="mt-3 space-y-2">
                  {jobs.map((j) => {
                    const expired = new Date(j.expires_at) < new Date();
                    return (
                      <div key={`mng-${j.id}`} className="rounded-2xl bg-white border border-ink/8 p-3 sm:p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-ink truncate">{j.title}</p>
                            <p className="text-[11px] text-ink/50 mt-0.5">
                              {budgetLabel(j.budget_band)} · Last activity {timeAgo(j.last_activity)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <Link to="/jobs/$id" params={{ id: j.id }} hash="responses" className="text-[10px] uppercase tracking-[0.16em] font-medium bg-ink text-paper px-3 py-1.5 rounded-full hover:bg-brass transition-colors">
                            Responses {j.response_count > 0 && <span className="ml-1 tabular-nums">({j.response_count})</span>}
                          </Link>
                          {!expired && j.status === "open" && (
                            <button onClick={() => onAction("pause", j.id)} className="text-[10px] uppercase tracking-[0.16em] border border-ink/15 px-3 py-1.5 rounded-full hover:border-brass">Pause</button>
                          )}
                          {j.status === "paused" && (
                            <button onClick={() => onAction("repost", j.id)} className="text-[10px] uppercase tracking-[0.16em] border border-ink/15 px-3 py-1.5 rounded-full hover:border-brass">Resume</button>
                          )}
                          {(expired || j.status === "closed") && (
                            <button onClick={() => onAction("repost", j.id)} className="text-[10px] uppercase tracking-[0.16em] border border-ink/15 px-3 py-1.5 rounded-full hover:border-brass">Repost</button>
                          )}
                          <JobInvitedProsToggle jobId={j.id} />
                          {j.status !== "closed" && (
                            <button onClick={() => setCloseTarget({ id: j.id, title: j.title })} className="ml-auto text-[10px] uppercase tracking-[0.16em] text-ink/50 hover:text-destructive transition-colors px-2 py-1.5">Close</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </section>

          {/* SUGGESTED PROS */}
          {jobs.filter((j) => j.status === "open" && new Date(j.expires_at) > new Date()).slice(0, 2).map((j) => (
            <section key={`sugg-${j.id}`} className="mb-6 scroll-mt-20">
              <SuggestedPros jobId={j.id} title={`Recommended for "${j.title}"`} subtitle="Hand-picked professionals matched to this job." />
            </section>
          ))}

          {/* RESPONSES */}
          <section id="responses" className="mb-6 scroll-mt-20">
            <div className="flex items-center justify-between px-1 mb-3">
              <h2 className="font-display text-lg sm:text-xl text-ink">Professional responses</h2>
              {threads.length > 0 && (
                <Link to="/customer/messages" className="text-xs text-ink/55 hover:text-ink inline-flex items-center gap-1">
                  View all <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
            {threads.length === 0 ? (
              <div className="rounded-3xl bg-white border border-dashed border-ink/15 p-8 text-center">
                <p className="text-sm text-ink/60">No professional responses yet. As pros respond to your jobs they'll appear here.</p>
              </div>
            ) : (
              <div className="rounded-3xl bg-white border border-ink/8 shadow-[0_2px_24px_-12px_rgba(0,0,0,0.06)] overflow-hidden divide-y divide-ink/8">
                {threads.slice(0, 5).map((t) => (
                  <Link
                    key={t.qr_id}
                    to="/threads/$id"
                    params={{ id: t.qr_id }}
                    className="flex items-center gap-3 p-3 sm:p-4 hover:bg-ink/[0.02] active:bg-ink/[0.04] transition-colors"
                  >
                    <div className="grid place-items-center h-11 w-11 shrink-0 rounded-full bg-champagne/40 text-brass font-display text-base">
                      {(t.professional_name ?? "P").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-ink truncate">{t.professional_name ?? "Professional"}</p>
                        {t.unread_count > 0 && (
                          <span className="text-[10px] bg-brass text-white px-1.5 py-0.5 rounded-full tabular-nums">{t.unread_count}</span>
                        )}
                        {t.hired && <span className="text-[10px] uppercase text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">Hired</span>}
                      </div>
                      {t.last_message_body && <p className="text-xs text-ink/60 truncate mt-0.5">{t.last_message_body}</p>}
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-ink/40 shrink-0">{timeAgo(t.last_message_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* RECOMMENDED ACTIONS */}
          <section className="mb-6">
            <h2 className="font-display text-lg sm:text-xl text-ink mb-3 px-1">Recommended actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <ActionTile Icon={FilePlus} title="Post a new project" desc="Add a project brief and start receiving responses." onClick={() => setPostOpen(true)} />
              <ActionTile Icon={Users} title="Review new responses" desc="Compare professionals before deciding." to="/dashboard" hash="responses" />
              <ActionTile Icon={MessageSquare} title="Message shortlisted pros" desc="Discuss details and ask questions directly." to="/customer/messages" />
              <ActionTile Icon={CheckCircle2} title="Mark job as hired" desc="Close briefs once you've hired your pro." to="/dashboard" hash="my-jobs" />
              <ActionTile Icon={FileText} title="View invoices" desc="See invoices issued by your hired pros." to="/account/settings" />
              <ActionTile Icon={Bell} title="Notifications" desc="Stay on top of replies and updates." to="/account/settings" />
            </div>
          </section>
        </div>
      </main>

      <DashboardFooter />
      <ClientMobileNav />

      <PostJobModal services={services} open={postOpen} onOpenChange={setPostOpen} />
      {closeTarget && (
        <CloseJobModal
          open={!!closeTarget}
          onOpenChange={(v) => { if (!v) setCloseTarget(null); }}
          jobId={closeTarget.id}
          jobTitle={closeTarget.title}
          onClosed={load}
        />
      )}
    </div>
  );
}

function StatTile({ Icon, label, value, href, hash, accent }: { Icon: typeof Briefcase; label: string; value: number; href: string; hash?: string; accent?: boolean }) {
  return (
    <Link
      to={href}
      hash={hash}
      className={`group rounded-2xl border p-4 transition-all hover:-translate-y-0.5 ${
        accent ? "border-brass/30 bg-brass/5 hover:border-brass" : "border-ink/8 bg-mist/40 hover:border-brass/40"
      }`}
    >
      <div className={`inline-grid place-items-center h-9 w-9 rounded-xl mb-3 ${accent ? "bg-brass text-paper" : "bg-white text-brass"}`}>
        <Icon className="w-4 h-4" strokeWidth={1.8} />
      </div>
      <p className="font-display text-2xl sm:text-3xl text-ink tabular-nums leading-none">{value}</p>
      <p className="text-[11px] text-ink/55 mt-1.5">{label}</p>
    </Link>
  );
}

function ActionTile({
  Icon, title, desc, to, hash, onClick,
}: { Icon: typeof Briefcase; title: string; desc: string; to?: string; hash?: string; onClick?: () => void }) {
  const inner = (
    <>
      <div className="inline-grid place-items-center h-10 w-10 rounded-xl shrink-0 bg-mist text-brass">
        <Icon className="w-4 h-4" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base text-ink leading-tight">{title}</p>
        <p className="text-[12px] text-ink/55 mt-1 leading-snug">{desc}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-ink/30 shrink-0 mt-1" />
    </>
  );
  const cls = "group rounded-2xl border border-ink/8 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brass/40 hover:shadow-[0_8px_28px_-16px_rgba(15,15,18,0.15)] flex items-start gap-3 text-left w-full";
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <Link to={to!} hash={hash} className={cls}>{inner}</Link>;
}
