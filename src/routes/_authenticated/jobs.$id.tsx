import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site/Header";
import { DashboardFooter } from "@/components/site/DashboardFooter";
import { ClientMobileNav } from "@/components/site/ClientMobileNav";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { getMyJob, pauseJob, repostJob } from "@/lib/leads.functions";
import { listCustomerThreads, type CustomerThread } from "@/lib/messages.functions";
import { durationLabel, budgetBandLabel } from "@/lib/format";
import { useRole } from "@/lib/role-context";
import { CloseJobModal } from "@/components/jobs/CloseJobModal";

export const Route = createFileRoute("/_authenticated/jobs/$id")({
  head: () => ({ meta: [{ title: "Job details — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: JobDetails,
});

type Job = {
  id: string;
  title: string;
  city: string;
  details: string | null;
  event_date: string | null;
  event_time: string | null;
  flexible_dates: boolean | null;
  duration: string | null;
  duration_days: number | null;
  duration_start_date: string | null;
  duration_end_date: string | null;
  duration_consecutive: boolean | null;
  duration_flexible: boolean | null;
  budget_band: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  kind: string;
  urgency: string | null;
  event_type: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  preferred_contact: string | null;
  inspiration_links: string[] | null;
  client_display_name: string | null;
  show_name_to_pros: boolean | null;
  service: { name: string } | null;
};

function budgetLabel(id: string | null): string {
  if (!id) return "—";
  return budgetBandLabel(id) ?? id;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function JobDetails() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { loaded, activeRole } = useRole();
  const [job, setJob] = useState<Job | null>(null);
  const [threads, setThreads] = useState<CustomerThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [closeOpen, setCloseOpen] = useState(false);

  useEffect(() => {
    if (loaded && activeRole === "professional") {
      navigate({ to: "/pro/dashboard" });
    }
  }, [loaded, activeRole, navigate]);

  const load = () => {
    setLoading(true);
    void Promise.all([getMyJob({ data: { job_id: id } }), listCustomerThreads()])
      .then(([j, t]) => {
        setJob(j as Job);
        setThreads((t as CustomerThread[]).filter((x) => x.job_id === id));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load job"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  async function onAction(action: "pause" | "close" | "repost") {
    if (action === "close") { setCloseOpen(true); return; }
    try {
      if (action === "pause") await pauseJob({ data: { job_id: id } });
      if (action === "repost") await repostJob({ data: { job_id: id } });
      toast.success("Updated");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!loaded || activeRole === "professional") {
    return <div className="min-h-screen bg-paper" aria-hidden />;
  }

  return (
    <div className="dashboard-readable bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <Link to="/dashboard" className="text-[11px] uppercase tracking-widest text-ink/60 hover:text-gold">← Back to dashboard</Link>

          {loading && !job ? (
            <p className="mt-8 text-sm text-ink/60">Loading…</p>
          ) : !job ? (
            <p className="mt-8 text-sm text-ink/60">Job not found.</p>
          ) : (
            <>
              <Header job={job} />
              <Actions job={job} onAction={onAction} />
              <Details job={job} />
              <Responses jobId={id} threads={threads} />
            </>
          )}
        </div>
      </main>
      {job && (
        <CloseJobModal
          open={closeOpen}
          onOpenChange={setCloseOpen}
          jobId={id}
          jobTitle={job.title}
          onClosed={load}
        />
      )}
      <DashboardFooter />
      <ClientMobileNav />
    </div>
  );
}

function Header({ job }: { job: Job }) {
  const expired = new Date(job.expires_at) < new Date();
  const statusLabel = expired ? "expired" : job.status;
  return (
    <div className="mt-4 mb-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-display text-3xl md:text-4xl">{job.title}</h1>
        <UrgencyBadge urgency={job.urgency} />
        <span className="font-mono text-[10px] uppercase tracking-widest text-gold border border-gold/40 px-2 py-0.5">{statusLabel}</span>
      </div>
      <p className="text-xs text-ink/60 mt-2">
        {job.service?.name} · {job.city}
        {job.event_date ? ` · ${job.event_date}` : ""}
      </p>
    </div>
  );
}

function Actions({ job, onAction }: { job: Job; onAction: (a: "pause" | "close" | "repost") => void }) {
  const expired = new Date(job.expires_at) < new Date();
  return (
    <div className="flex flex-wrap gap-2 mb-8">
      {!expired && job.status === "open" && (
        <button onClick={() => onAction("pause")} className="text-[11px] uppercase tracking-widest border border-ink/15 px-3 py-2 hover:border-gold">Pause</button>
      )}
      {job.status === "paused" && (
        <button onClick={() => onAction("repost")} className="text-[11px] uppercase tracking-widest border border-ink/15 px-3 py-2 hover:border-gold">Resume</button>
      )}
      {(expired || job.status === "closed") && (
        <button onClick={() => onAction("repost")} className="text-[11px] uppercase tracking-widest border border-ink/15 px-3 py-2 hover:border-gold">Repost</button>
      )}
      {job.status !== "closed" && (
        <button onClick={() => onAction("close")} className="text-[11px] uppercase tracking-widest text-ink/60 hover:text-destructive border border-ink/15 px-3 py-2">Close</button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-2 border-b border-ink/5 last:border-0">
      <p className="text-[10px] uppercase tracking-widest text-ink/50">{label}</p>
      <p className="text-sm text-ink/90 break-words">{value ?? "—"}</p>
    </div>
  );
}

function Details({ job }: { job: Job }) {
  const dur = durationLabel(job.duration);
  const durExtra =
    job.duration === "multi-day" && job.duration_days
      ? ` (${job.duration_days} days${job.duration_consecutive ? ", consecutive" : ""}${job.duration_flexible ? ", flexible" : ""})`
      : "";
  return (
    <section className="bg-white border border-ink/10 p-6 mb-10">
      <h2 className="font-display text-xl mb-4">Job details</h2>
      <Row label="Service" value={job.service?.name} />
      <Row label="Type" value={job.kind} />
      <Row label="Event type" value={job.event_type} />
      <Row label="City" value={job.city} />
      <Row label="Event date" value={job.event_date ? `${job.event_date}${job.event_time ? ` at ${job.event_time}` : ""}${job.flexible_dates ? " (flexible)" : ""}` : null} />
      <Row label="Duration" value={dur ? `${dur}${durExtra}` : null} />
      {(job.duration_start_date || job.duration_end_date) && (
        <Row label="Date range" value={`${job.duration_start_date ?? "?"} → ${job.duration_end_date ?? "?"}`} />
      )}
      <Row label="Budget" value={budgetLabel(job.budget_band)} />
      <Row label="Urgency" value={job.urgency} />
      <Row label="Details" value={<span className="whitespace-pre-wrap">{job.details}</span>} />
      {job.inspiration_links && job.inspiration_links.length > 0 && (
        <Row
          label="Inspiration"
          value={
            <ul className="space-y-1">
              {job.inspiration_links.map((l) => (
                <li key={l}><a href={l} target="_blank" rel="noreferrer" className="underline hover:text-gold break-all">{l}</a></li>
              ))}
            </ul>
          }
        />
      )}
      <Row label="Contact name" value={job.contact_name} />
      <Row label="Contact phone" value={job.contact_phone} />
      <Row label="Preferred contact" value={job.preferred_contact} />
      <Row label="Display name" value={job.client_display_name} />
      <Row label="Shown to pros" value={job.show_name_to_pros ? "Yes" : "No (private)"} />
      <Row label="Posted" value={fmtDate(job.created_at)} />
      <Row label="Expires" value={fmtDate(job.expires_at)} />
    </section>
  );
}

function Responses({ jobId, threads }: { jobId: string; threads: CustomerThread[] }) {
  return (
    <section id="responses" className="scroll-mt-20 mb-16">
      <h2 className="font-display text-2xl mb-4">Responses ({threads.length})</h2>
      {threads.length === 0 ? (
        <p className="text-sm text-ink/60">No professional responses for this job yet.</p>
      ) : (
        <div className="border border-ink/10 divide-y divide-ink/10 bg-white">
          {threads.map((t) => (
            <Link key={t.qr_id} to="/threads/$id" params={{ id: t.qr_id }} className="flex justify-between items-center gap-4 p-4 hover:bg-ink/[0.02]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-display text-lg truncate">{t.professional_name ?? "Professional"}</p>
                  {t.unread_count > 0 && (
                    <span className="font-mono text-[10px] bg-gold text-white px-1.5 py-0.5 rounded-sm">{t.unread_count} new</span>
                  )}
                  {t.hired && <span className="font-mono text-[10px] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5">Hired</span>}
                </div>
                {t.last_message_body && <p className="text-xs text-ink/70 truncate mt-1">{t.last_message_body}</p>}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-ink/40 shrink-0">{t.status}</span>
            </Link>
          ))}
        </div>
      )}
      {/* jobId reserved for future per-job actions */}
      <input type="hidden" value={jobId} readOnly />
    </section>
  );
}
