import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProShell } from "@/components/site/ProShell";
import { myUnlockedLeads } from "@/lib/leads.functions";
import { budgetBandLabel } from "@/lib/format";
import { MessageSquare, MapPin, Calendar, Coins } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pro/unlocked")({
  head: () => ({
    meta: [
      { title: "Unlocked projects — Shootbase" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnlockedLeadsPage,
});

type UnlockedLead = Awaited<ReturnType<typeof myUnlockedLeads>>[number];

function budgetLabel(id: string | null): string {
  if (!id) return "—";
  return budgetBandLabel(id) ?? id;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function UnlockedLeadsPage() {
  const [leads, setLeads] = useState<UnlockedLead[] | null>(null);

  useEffect(() => {
    void myUnlockedLeads().then((rows) => setLeads(rows));
  }, []);

  return (
    <ProShell>
      <div className="dashboard-readable max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink/50">Pro workspace</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-2">Unlocked projects</h1>
          <p className="text-sm text-ink/60 mt-2">
            Projects you've unlocked and can contact directly. Locked projects stay in the{" "}
            <Link to="/pro/leads" className="underline hover:text-gold">marketplace</Link>.
          </p>
        </div>

        {leads === null ? (
          <p className="text-sm text-ink/60">Loading…</p>
        ) : leads.length === 0 ? (
          <div className="border border-dashed border-ink/15 rounded-2xl p-10 text-center">
            <p className="text-sm text-ink/60 mb-4">You haven't unlocked any projects yet.</p>
            <Link
              to="/pro/leads"
              className="inline-block bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-gold"
            >
              Browse marketplace
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map((l) => {
              return (
                <div key={l.unlock_id} className="border border-ink/10 bg-white rounded-2xl p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <h2 className="font-display text-lg sm:text-xl text-ink truncate">{l.title}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink/60">
                        {l.city && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {l.city}
                          </span>
                        )}
                        {l.event_date && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {fmtDate(l.event_date)}
                          </span>
                        )}
                        <span>Budget: {budgetLabel(l.budget_band)}</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest bg-gold/15 text-gold px-2 py-1 rounded-full">
                      <Coins className="w-3 h-3" /> {l.credits_used} used
                    </span>
                  </div>

                  {l.details && (
                    <p className="mt-3 text-sm text-ink/70 line-clamp-3">{l.details}</p>
                  )}

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] text-ink/70">
                    <div>
                      <span className="text-ink/50">Client:</span> {l.customer_name ?? "—"}
                    </div>
                    <div>
                      <span className="text-ink/50">Mobile:</span>{" "}
                      {l.customer_phone ? (
                        <span className="text-ink">{l.customer_phone}</span>
                      ) : (
                        <span className="text-amber-700">Pending</span>
                      )}
                      {l.customer_verified_phone && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full align-middle">
                          ✅ Mobile verified
                        </span>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-ink/50">Email:</span>{" "}
                      {l.customer_email ? (
                        <span className="text-ink break-all">{l.customer_email}</span>
                      ) : (
                        <span className="text-ink/50">—</span>
                      )}
                    </div>
                    <div>
                      <span className="text-ink/50">Unlocked:</span> {fmtDate(l.unlocked_at)}
                    </div>
                    <div>
                      <span className="text-ink/50">Status:</span> Unlocked
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {l.quote_request_id ? (
                      <Link
                        to="/threads/$id"
                        params={{ id: l.quote_request_id }}
                        className="inline-flex items-center gap-2 bg-ink text-paper px-4 py-2.5 rounded-full text-[11px] uppercase tracking-widest font-medium hover:bg-gold transition-colors min-h-[44px]"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Message client
                      </Link>
                    ) : (
                      <span
                        className="inline-flex items-center gap-2 bg-ink/10 text-ink/50 px-4 py-2.5 rounded-full text-[11px] uppercase tracking-widest font-medium min-h-[44px] cursor-not-allowed"
                        title="Conversation is being prepared. Try again in a moment."
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Message client
                      </span>
                    )}
                    {l.customer_email && (
                      <a
                        href={`mailto:${l.customer_email}`}
                        className="inline-flex items-center px-4 py-2.5 rounded-full text-[11px] uppercase tracking-widest border border-ink/15 hover:border-gold min-h-[44px]"
                      >
                        Email
                      </a>
                    )}
                    {l.customer_phone && (
                      <a
                        href={`tel:${l.customer_phone}`}
                        className="inline-flex items-center px-4 py-2.5 rounded-full text-[11px] uppercase tracking-widest border border-ink/15 hover:border-gold min-h-[44px]"
                      >
                        Call
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ProShell>
  );
}
