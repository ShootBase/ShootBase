import { ProShell } from "@/components/site/ProShell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { myQuoteRequests, getMyProfile, getMyAvatar, getMyProPreview, listServices } from "@/lib/marketplace.functions";
import { listProThreads } from "@/lib/messages.functions";
import { redeemReferral } from "@/lib/referral.functions";
import { toast } from "sonner";
import { browseLeads, myUnlockedLeads, myPostedLeads } from "@/lib/leads.functions";
import { getMyMatchingLeads, type MatchingLead } from "@/lib/lead-notifications.functions";
import { ProAvatar } from "@/components/pro/ProAvatar";
import { type ProfileSignals } from "@/components/pro/GettingStartedPanel";
import { ClientRequestedYouPanel } from "@/components/contact-requests/ClientRequestedYouPanel";
import { PostJobModal } from "@/components/home/PostJobModal";
import { ProfileCompletenessNudge } from "@/components/pro/ProfileCompletenessNudge";
import { supabase } from "@/integrations/supabase/client";
import { getMyCreditsOverview } from "@/lib/credits.functions";
import {
  ArrowRight,
  Search,
  MessageSquare,
  Lock,
  Trophy,
  UserCircle,
  Coins,
  Calendar,
  MapPin,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/pro/dashboard")({
  head: () => ({ meta: [{ title: "Pro dashboard — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: ProDash,
});

type Project = { id: string; status: string; details: string; created_at: string; location: string | null; event_date: string | null };

const PROFILE_CHECKLIST: Array<{ key: keyof ProfileSignals; label: string; short: string; action: string; href: string }> = [
  { key: "hasPhoto", label: "Profile photo uploaded", short: "profile photo", action: "Upload Profile Photo", href: "/pro/settings#avatar" },
  { key: "hasAbout", label: "Business description completed", short: "business description", action: "Add Business Description", href: "/pro/onboarding#about" },
  { key: "hasServices", label: "Service categories selected", short: "service categories", action: "Select Service Categories", href: "/pro/onboarding#services" },
  { key: "hasLocation", label: "Service locations added", short: "service location", action: "Add Service Location", href: "/pro/onboarding#location" },
  { key: "hasPortfolio", label: "Portfolio uploaded", short: "portfolio", action: "Upload Portfolio", href: "/pro/onboarding#portfolio" },
  { key: "hasContact", label: "Contact information completed", short: "contact information", action: "Complete Contact Information", href: "/pro/onboarding#contact" },
  { key: "hasPricing", label: "Pricing information added", short: "pricing", action: "Add Pricing", href: "/pro/onboarding#pricing" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function ProDash() {
  const [leads, setLeads] = useState<Project[]>([]);
  const [proSlug, setProSlug] = useState<string | null>(null);
  const [hasPro, setHasPro] = useState(false);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [signals, setSignals] = useState<ProfileSignals>({
    hasPhoto: false, hasAbout: false, hasServices: false, hasLocation: false,
    hasPortfolio: false, hasContact: false, hasPricing: false, hasAvailability: false,
  });
  const [metrics, setMetrics] = useState({ available: 0, unlocked: 0, conversations: 0, posted: 0 });
  const [matches, setMatches] = useState<MatchingLead[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [services, setServices] = useState<Array<{ id: string; name: string; kind: "photography" | "videography"; slug: string }>>([]);
  const [hasInstagram, setHasInstagram] = useState(false);
  const [signalsReady, setSignalsReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let ref: string | null = null;
    try { ref = localStorage.getItem("shootbase.ref"); } catch {}
    if (!ref) return;
    void redeemReferral({ data: { slug: ref } }).then((res) => {
      try { localStorage.removeItem("shootbase.ref"); } catch {}
      if (res?.granted) toast.success(`+${res.amount} coins — referral bonus applied!`);
    }).catch(() => {
      try { localStorage.removeItem("shootbase.ref"); } catch {}
    });
  }, []);

  useEffect(() => {
    void Promise.all([myQuoteRequests(), getMyProfile(), getMyAvatar(), getMyProPreview()]).then(([q, me, av, preview]) => {
      setLeads(q as Project[]);
      setHasPro(!!me.professional);
      setProSlug(me.professional?.slug ?? null);
      setBusinessName(me.professional?.business_name ?? null);
      setFirstName(me.profile?.full_name?.trim().split(/\s+/)[0] ?? null);
      setAvatarUrl(av.url);
      const p = preview as any;
      const igHandle = (p?.instagram ?? (me.professional as { instagram?: string | null } | null)?.instagram) ?? null;
      setHasInstagram(Boolean(igHandle && String(igHandle).trim().length > 0));
      setSignals({
        hasPhoto: !!av.url,
        hasAbout: !!p?.about && String(p.about).trim().length >= 30,
        hasServices: Array.isArray(p?.professional_services) && p.professional_services.length > 0,
        hasLocation: !!p?.city,
        hasPortfolio: Array.isArray(p?.portfolio) && p.portfolio.length > 0,
        hasContact: !!p?.contact_name,
        hasPricing: typeof p?.starting_price_pence === "number" && p.starting_price_pence > 0,
        hasAvailability: false,
      });
      setSignalsReady(true);
    });
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));

    void Promise.all([browseLeads({ data: {} }), myUnlockedLeads(), listProThreads(), myPostedLeads(), listServices()]).then(([b, u, t, posted, svc]) => {
      const available = (b.leads ?? []).filter((l: { unlocked?: boolean }) => !l.unlocked).length;
      const conversations = (t ?? []).filter((thread) => !thread.archived_by_pro && !thread.closed).length;
      setMetrics({ available, unlocked: u.length, conversations, posted: (posted as unknown as any[]).length });
      setServices(svc as any);
    });

    void getMyMatchingLeads().then((r) => {
      if (r.hasProfile) {
        setMatches(r.matches);
        setUnreadCount(r.unreadCount);
      }
    });

    void getMyCreditsOverview().then((r) => {
      if (typeof r?.balance === "number") setCreditsBalance(r.balance);
    }).catch(() => {});
  }, []);

  const completion = useMemo(() => {
    const total = PROFILE_CHECKLIST.length;
    const done = PROFILE_CHECKLIST.filter((c) => signals[c.key]).length;
    return { done, total, pct: Math.round((done / total) * 100) };
  }, [signals]);

  const dynamicHeadline = useMemo(() => {
    if (unreadCount > 0) return `${unreadCount} new matching ${unreadCount === 1 ? "project" : "projects"} for you today`;
    if (matches.length > 0) return `${matches.length} ${matches.length === 1 ? "project matches" : "projects match"} your profile`;
    if (!hasPro) return "Set up your profile to start receiving creative projects";
    return "Find your next creative project on ShootBase";
  }, [unreadCount, matches.length, hasPro]);

  return (
    <ProShell>
      <div className="dashboard-readable max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Greeting */}
        <div className="mb-5 sm:mb-6">
          <h1 className="font-display text-[28px] sm:text-4xl text-ink leading-tight">
            {greeting()}, {firstName || businessName || "there"} <span aria-hidden>👋</span>
          </h1>
          <p className="text-sm sm:text-base text-ink/60 mt-1">{dynamicHeadline}</p>
        </div>

        {/* Grid: hero + completion side-by-side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 mb-5 sm:mb-6">
          {/* HERO */}
          <section className="lg:col-span-8 relative overflow-hidden rounded-3xl surface-noir p-6 sm:p-8 lg:p-10 min-h-[240px] flex flex-col justify-between animate-fade-in">
            <div className="blob animate-float-slow pointer-events-none" style={{ width: 320, height: 320, top: -120, right: -100, background: "radial-gradient(circle, #D4A574, transparent 60%)", opacity: 0.5 }} />
            <div className="relative max-w-md">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.24em] text-champagne/80 mb-3">Your workspace</p>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-paper leading-[1.05]">
                Your next <span className="italic text-gradient-champagne">opportunity</span> could be here.
              </h2>
              <p className="text-sm text-paper/65 mt-3 leading-relaxed">
                Find projects, connect with clients and grow your creative business on ShootBase.
              </p>
            </div>
            <div className="relative flex flex-wrap gap-2 mt-6">
              <Link to="/pro/leads" className="inline-flex items-center gap-2 bg-paper text-ink px-5 py-3 rounded-full text-[11px] uppercase tracking-[0.18em] font-medium hover:bg-champagne transition-all min-h-[44px]">
                Browse projects <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link to="/pro/responses" className="inline-flex items-center gap-2 bg-paper/10 text-paper border border-paper/20 px-5 py-3 rounded-full text-[11px] uppercase tracking-[0.18em] font-medium hover:bg-paper/20 transition-all min-h-[44px]">
                Messages
                {metrics.conversations > 0 && <span className="bg-brass text-ink rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">{metrics.conversations}</span>}
              </Link>
            </div>
          </section>

          {/* COMPLETION CARD */}
          <ProfileCompletionCard signals={signals} completion={completion} />
        </div>


        {/* ACTIVITY STATS */}
        <section className="rounded-3xl bg-white border border-ink/8 shadow-[0_2px_24px_-12px_rgba(0,0,0,0.06)] p-5 sm:p-6 mb-5 sm:mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg sm:text-xl text-ink">Your activity</h2>
            <span className="text-[11px] text-ink/45 uppercase tracking-widest">This month</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <StatTile Icon={Search} label="Projects available" value={metrics.available} href="/pro/leads" />
            <StatTile Icon={MessageSquare} label="Active chats" value={metrics.conversations} href="/pro/responses" />
            <StatTile Icon={Lock} label="Unlocked" value={metrics.unlocked} href="/pro/unlocked" />
            <StatTile Icon={Coins} label="Credits" value={creditsBalance ?? 0} href="/pro/credits" accent />
          </div>
        </section>

        <ClientRequestedYouPanel />

        {/* TODAY'S OPPORTUNITIES */}
        <section className="mb-5 sm:mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <div>
              <h2 className="font-display text-lg sm:text-xl text-ink">Today's opportunities</h2>
              <p className="text-[12px] text-ink/55 mt-0.5">Projects matched to your services & location</p>
            </div>
            <Link to="/pro/leads" className="text-xs text-ink/55 hover:text-ink inline-flex items-center gap-1">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {matches.length === 0 ? (
            <div className="rounded-3xl bg-white border border-dashed border-ink/15 p-8 text-center">
              <Sparkles className="w-6 h-6 text-brass mx-auto mb-3" />
              <p className="text-sm text-ink/60 mb-3">No matching projects right now.</p>
              <Link to="/pro/onboarding" className="text-[11px] uppercase tracking-widest border border-ink/20 rounded-full px-4 py-2 hover:border-brass">
                Update services & area
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {matches.slice(0, 6).map((m) => {
                const isNew = Date.now() - new Date(m.created_at).getTime() < 24 * 60 * 60 * 1000;
                return (
                  <Link
                    key={m.notification_id}
                    to="/pro/leads"
                    search={{ job: m.job_id }}
                    className="group rounded-2xl bg-white border border-ink/8 p-4 hover:border-brass hover:shadow-[0_8px_28px_-16px_rgba(212,165,116,0.5)] transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {isNew && <span className="font-mono text-[10px] uppercase tracking-widest text-brass bg-brass/10 px-2 py-0.5 rounded-full">New</span>}
                      {m.unlocked && <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Unlocked</span>}
                    </div>
                    <p className="font-display text-lg leading-tight text-ink line-clamp-2 group-hover:text-brass transition-colors">{m.title}</p>
                    <div className="mt-2 flex items-center gap-2 text-[12px] text-ink/55">
                      {m.city && (<><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{m.city}</span></>)}
                    </div>
                    {(m.budget_band || m.event_date) && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink/50">
                        {m.budget_band && <span>{m.budget_band}</span>}
                        {m.event_date && <><Calendar className="w-3 h-3" /><span>{m.event_date}</span></>}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* NEXT STEPS (replaces Bark-style vertical list with action tiles) */}
        <section className="mb-5 sm:mb-6">
          <h2 className="font-display text-lg sm:text-xl text-ink mb-3 px-1">Recommended next steps</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ActionTile
              Icon={UserCircle}
              title="Complete your profile"
              desc="Add details and portfolio so clients can find you."
              to="/pro/onboarding"
              done={completion.pct === 100}
            />
            <ActionTile
              Icon={Search}
              title="Discover projects"
              desc="Browse photography, videography and creative briefs."
              to="/pro/leads"
            />
            <ActionTile
              Icon={Lock}
              title="Unlock client details"
              desc="Use credits to view contact info and respond."
              to="/pro/credits"
            />
            <ActionTile
              Icon={MessageSquare}
              title="Start the conversation"
              desc="Message clients directly and build relationships."
              to="/pro/responses"
            />
            <ActionTile
              Icon={Trophy}
              title="Win more work"
              desc="Deliver great work, earn reviews and grow."
              to={proSlug ? "/pro/$slug" : "/pro/dashboard"}
              params={proSlug ? { slug: proSlug } : undefined}
            />
            <ActionTile
              Icon={TrendingUp}
              title="Boost your visibility"
              desc="Subscribe for priority alerts and more leads."
              to="/pro/credits"
              accent
            />
          </div>
        </section>

        {/* RECENT ENQUIRIES */}
        {leads.length > 0 && (
          <section className="mb-5 sm:mb-6">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="font-display text-lg sm:text-xl text-ink">Recent enquiries</h2>
              <Link to="/pro/responses" className="text-xs text-ink/55 hover:text-ink inline-flex items-center gap-1">
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="rounded-3xl bg-white border border-ink/8 overflow-hidden divide-y divide-ink/8">
              {leads.slice(0, 5).map((q) => (
                <Link
                  key={q.id}
                  to="/threads/$id"
                  params={{ id: q.id }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 hover:bg-ink/[0.02] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-display text-lg text-ink truncate">{q.location ?? "New enquiry"}</p>
                    <p className="text-xs text-ink/60 truncate mt-0.5">{q.details}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-brass">{q.status}</span>
                    {q.event_date && <p className="text-[10px] text-ink/45 mt-1">{q.event_date}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Avatar nudge */}
        {hasPro && !avatarUrl && (
          <div className="rounded-2xl border border-brass/30 bg-brass/5 p-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <ProAvatar src={avatarUrl} name={businessName} size="md" />
              <p className="text-sm text-ink/80 max-w-md">
                Profiles with a photo earn more client trust. Upload your professional image now.
              </p>
            </div>
            <Link to="/pro/settings" hash="avatar" className="bg-ink text-paper px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-medium hover:bg-brass">
              Upload image
            </Link>
          </div>
        )}
      </div>

      <PostJobModal services={services} open={postOpen} onOpenChange={setPostOpen} />
      {hasPro && (
        <ProfileCompletenessNudge
          userId={userId}
          hasInstagram={hasInstagram}
          hasPortfolio={signals.hasPortfolio}
          ready={signalsReady}
        />
      )}
    </ProShell>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 76;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(15,15,18,0.08)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#D4A574"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 600ms ease" }}
      />
    </svg>
  );
}

function StatTile({ Icon, label, value, href, accent }: { Icon: typeof Search; label: string; value: number; href: string; accent?: boolean }) {
  return (
    <Link
      to={href}
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
  Icon, title, desc, to, params, done, accent,
}: { Icon: typeof Search; title: string; desc: string; to: string; params?: Record<string, string>; done?: boolean; accent?: boolean }) {
  const linkProps = (params ? { to, params } : { to }) as React.ComponentProps<typeof Link>;
  return (
    <Link
      {...linkProps}
      className={`group rounded-2xl border p-5 transition-all hover:-translate-y-0.5 flex items-start gap-3 ${
        accent ? "border-brass/30 bg-brass/5" : "border-ink/8 bg-white hover:border-brass/40 hover:shadow-[0_8px_28px_-16px_rgba(15,15,18,0.15)]"
      }`}
    >
      <div className={`inline-grid place-items-center h-10 w-10 rounded-xl shrink-0 ${done ? "bg-emerald-50 text-emerald-700" : accent ? "bg-brass text-paper" : "bg-mist text-brass"}`}>
        <Icon className="w-4 h-4" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base text-ink leading-tight">{title}</p>
        <p className="text-[12px] text-ink/55 mt-1 leading-snug">{desc}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-ink/30 shrink-0 mt-1 group-hover:text-brass group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

const COLLAPSE_KEY = "shootbase.profileCompletion.collapsed";

function ProfileCompletionCard({
  signals,
  completion,
}: {
  signals: ProfileSignals;
  completion: { done: number; total: number; pct: number };
}) {
  const missing = PROFILE_CHECKLIST.filter((c) => !signals[c.key]);
  const next = missing[0] ?? null;
  const remaining = missing.length;
  const isComplete = completion.pct === 100;
  const completeHref = next?.href ?? "/pro/onboarding";

  const [collapsed, setCollapsed] = useState<boolean>(isComplete);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY);
      if (stored === "1") setCollapsed(true);
      else if (stored === "0") setCollapsed(false);
      else setCollapsed(isComplete);
    } catch {
      setCollapsed(isComplete);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed, hydrated]);

  return (
    <section className="lg:col-span-4 rounded-3xl bg-white border border-ink/8 shadow-[0_2px_24px_-12px_rgba(0,0,0,0.08)] p-6 sm:p-7 flex flex-col">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h3 className="font-display text-lg text-ink">Profile completion</h3>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-brass tabular-nums">{completion.pct}%</span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand profile completion" : "Collapse profile completion"}
            className="inline-grid place-items-center h-8 w-8 rounded-full text-ink/60 hover:text-ink hover:bg-ink/5 transition-colors"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <ProgressRing pct={completion.pct} />
        <div className="min-w-0">
          <p className="font-display text-2xl text-ink tabular-nums leading-none">
            {completion.done}/{completion.total}
          </p>
          <p className="text-[11px] text-ink/55 uppercase tracking-widest mt-1">steps complete</p>
        </div>
      </div>

      <div
        className="grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out"
        style={{ gridTemplateRows: collapsed ? "0fr" : "1fr", opacity: collapsed ? 0 : 1, marginTop: collapsed ? 0 : "1rem" }}
      >
        <div className="overflow-hidden">
          {next ? (
            <div className="rounded-2xl bg-brass/5 border border-brass/20 p-3 mb-3">
              <p className="text-[11px] uppercase tracking-widest text-brass font-medium">
                {remaining} step{remaining === 1 ? "" : "s"} remaining
              </p>
              <p className="text-sm text-ink mt-1">{next.action}</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 mb-3">
              <p className="text-sm text-emerald-800">Your profile is complete. Nice work.</p>
            </div>
          )}
          <ul className="space-y-1.5 text-sm">
            {PROFILE_CHECKLIST.map((c) => {
              const done = signals[c.key];
              return (
                <li key={c.key} className="flex items-center gap-2">
                  <span
                    className={`inline-grid place-items-center h-4 w-4 rounded-full text-[10px] ${
                      done ? "bg-brass/20 text-brass" : "bg-ink/5 text-ink/30"
                    }`}
                  >
                    {done ? "✓" : "•"}
                  </span>
                  <span className={done ? "text-ink" : "text-ink/55"}>{c.label}</span>
                </li>
              );
            })}
          </ul>
          <a
            href={completeHref}
            className="mt-4 inline-flex items-center justify-center gap-2 bg-ink text-paper rounded-full px-4 py-2.5 text-[11px] uppercase tracking-widest font-medium hover:bg-brass transition-colors min-h-[44px] w-full"
          >
            {next ? next.action : "Profile complete"} <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
