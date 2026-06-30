import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProShell } from "@/components/site/ProShell";
import { myPostedLeads, pauseJob, repostJob } from "@/lib/leads.functions";
import { listServices } from "@/lib/marketplace.functions";
import { PostJobModal } from "@/components/home/PostJobModal";
import { CloseJobModal } from "@/components/jobs/CloseJobModal";
import { JobInvitedProsToggle } from "@/components/contact-requests/JobInvitedProsToggle";
import { budgetBandLabel } from "@/lib/format";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { toast } from "sonner";
import { MapPin, Calendar, Briefcase, Unlock, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pro/posted-jobs")({
  head: () => ({ meta: [{ title: "My posted jobs — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: PostedJobs,
});

type Job = {
  id: string;
  title: string;
  city: string;
  event_date: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  kind: string;
  budget_band: string | null;
  urgency: string | null;
  service: { name: string } | null;
  response_count: number;
  unlock_count: number;
  last_activity: string | null;
};

function budgetLabel(id: string | null) {
  if (!id) return "—";
  return budgetBandLabel(id) ?? id;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function PostedJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [postOpen, setPostOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<{ id: string; title: string } | null>(null);

  const load = () => {
    void Promise.all([myPostedLeads(), listServices()]).then(([j, s]) => {
      setJobs(j as unknown as Job[]);
      setServices(s as any[]);
    });
  };
  useEffect(load, []);

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

  return (
    <ProShell>
      <div className="dashboard-readable max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div>
            <Link to="/pro/dashboard" className="text-xs uppercase tracking-widest text-ink/60 mb-2 inline-block">← Dashboard</Link>
            <h1 className="font-display text-4xl">My posted jobs</h1>
            <p className="text-sm text-ink/60 mt-2">Jobs you've posted to hire other professionals.</p>
          </div>
          <button
            onClick={() => setPostOpen(true)}
            className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold transition-colors"
          >
            + Post a Job
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-2xl bg-white border border-dashed border-ink/15 p-12 text-center">
            <Briefcase className="w-10 h-10 mx-auto text-ink/30 mb-4" strokeWidth={1.4} />
            <p className="text-sm text-ink/60 mb-4">You haven't posted any jobs yet.</p>
            <button
              onClick={() => setPostOpen(true)}
              className="text-[11px] uppercase tracking-[0.2em] bg-ink text-paper px-5 py-3 rounded-full hover:bg-brass transition-colors"
            >
              Post Your First Job
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {jobs.map((j) => {
              const expired = new Date(j.expires_at) < new Date();
              const statusLabel = expired ? "Expired" : j.status === "open" ? "Open" : j.status === "paused" ? "Paused" : j.status === "closed" ? "Closed" : j.status;
              const tone =
                statusLabel === "Open"
                  ? "bg-emerald-50 text-emerald-700"
                  : statusLabel === "Paused"
                    ? "bg-amber-50 text-amber-700"
                    : statusLabel === "Closed"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-ink/5 text-ink/60";
              return (
                <div key={j.id} className="rounded-2xl bg-white border border-ink/10 shadow-[0_2px_24px_-12px_rgba(0,0,0,0.06)] p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <h3 className="font-display text-xl text-ink leading-tight truncate">{j.title}</h3>
                      <p className="text-xs text-ink/55 mt-1">{j.service?.name ?? "—"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-ink/55">
                        <span className="inline-flex items-center gap-1.5"><MapPin className="w-3 h-3" strokeWidth={1.6} />{j.city || "—"}</span>
                        {j.event_date && (
                          <span className="inline-flex items-center gap-1.5"><Calendar className="w-3 h-3" strokeWidth={1.6} />{formatDate(j.event_date)}</span>
                        )}
                        <span>· {budgetLabel(j.budget_band)}</span>
                        <span>· Posted {formatDate(j.created_at)}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center text-[10px] uppercase tracking-[0.14em] font-medium px-2 py-0.5 rounded-full ${tone}`}>
                          {statusLabel}
                        </span>
                        <UrgencyBadge urgency={j.urgency} />
                        <span className="inline-flex items-center gap-1 text-[11px] text-ink/60"><MessageSquare className="w-3 h-3" />{j.response_count} {j.response_count === 1 ? "response" : "responses"}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-ink/60"><Unlock className="w-3 h-3" />{j.unlock_count} unlocked</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-ink/8 flex flex-wrap items-center gap-2">
                    <Link
                      to="/jobs/$id"
                      params={{ id: j.id }}
                      hash="responses"
                      className="text-[10px] uppercase tracking-[0.16em] font-medium bg-ink text-paper px-3 py-1.5 rounded-full hover:bg-brass transition-colors"
                    >
                      View responses {j.response_count > 0 && <span className="ml-1 tabular-nums">({j.response_count})</span>}
                    </Link>
                    <JobInvitedProsToggle jobId={j.id} />
                    {!expired && j.status === "open" && (
                      <button onClick={() => onAction("pause", j.id)} className="text-[10px] uppercase tracking-[0.16em] border border-ink/15 px-3 py-1.5 rounded-full hover:border-brass transition-colors">Pause</button>
                    )}
                    {j.status === "paused" && (
                      <button onClick={() => onAction("repost", j.id)} className="text-[10px] uppercase tracking-[0.16em] border border-ink/15 px-3 py-1.5 rounded-full hover:border-brass transition-colors">Reopen</button>
                    )}
                    {(expired || j.status === "closed") && (
                      <button onClick={() => onAction("repost", j.id)} className="text-[10px] uppercase tracking-[0.16em] border border-ink/15 px-3 py-1.5 rounded-full hover:border-brass transition-colors">Reopen</button>
                    )}
                    {j.status !== "closed" && (
                      <button
                        onClick={() => setCloseTarget({ id: j.id, title: j.title })}
                        className="ml-auto text-[20px] uppercase tracking-[0.16em] font-bold text-ink/70 hover:text-destructive transition-colors px-2 py-1.5"
                      >
                        Close / Mark as hired
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <PostJobModal services={services} open={postOpen} onOpenChange={setPostOpen} />
      {closeTarget && (
        <CloseJobModal
          jobId={closeTarget.id}
          jobTitle={closeTarget.title}
          open={!!closeTarget}
          onOpenChange={(o) => { if (!o) setCloseTarget(null); }}
          onClosed={() => { setCloseTarget(null); load(); }}
        />
      )}
    </ProShell>
  );
}
