import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  myClientContactRequests,
  type ClientContactRequest,
} from "@/lib/contact-requests.functions";

function statusChip(s: ClientContactRequest["status"]) {
  switch (s) {
    case "pending":
      return { label: "Pending", cls: "bg-ink/5 text-ink/70" };
    case "viewed":
      return { label: "Viewed", cls: "bg-ink/10 text-ink/80" };
    case "unlocked":
      return { label: "Unlocked", cls: "bg-gold/15 text-gold" };
    case "responded":
      return { label: "Responded", cls: "bg-emerald-100 text-emerald-700" };
  }
}

export function ClientRequestedYouPanel() {
  const [rows, setRows] = useState<ClientContactRequest[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void myClientContactRequests().then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null || rows.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-end justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl">Client Requested You</h2>
          <p className="text-xs text-ink/60 mt-1">
            Clients invited you to respond. Unlock the project to see contact details and start a
            conversation — your existing coin balance is used.
          </p>
        </div>
      </div>
      <div className="border border-gold/30 bg-gold/5 divide-y divide-ink/10 space-y-0">
        {rows.map((r) => {
          const s = statusChip(r.status);
          return (
            <div
              key={r.id}
              className="p-5 sm:p-4 grid grid-cols-1 sm:flex sm:items-center gap-3 sm:gap-4 sm:flex-wrap"
            >
              <div className="min-w-0 sm:flex-1">
                <p className="font-display text-[18px] leading-snug sm:text-lg sm:truncate break-words">
                  {r.title}
                </p>
                <p className="text-[13px] sm:text-xs text-ink/70 sm:text-ink/60 mt-1 sm:mt-0 sm:truncate break-words">
                  {[r.service_name, r.city, r.event_date, r.budget_band]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-[12px] sm:text-[11px] text-ink/50 mt-1.5 sm:mt-1">
                  Requested{" "}
                  {new Date(r.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                <span
                  className={`text-[11px] sm:text-[10px] uppercase tracking-widest px-2 py-1 sm:py-0.5 ${s.cls}`}
                >
                  {s.label}
                </span>
                <Link
                  to="/pro/leads"
                  search={{ job: r.job_id }}
                  className="bg-ink text-paper px-4 py-2.5 sm:py-2 text-[12px] sm:text-[11px] uppercase tracking-widest font-medium hover:bg-gold min-h-[44px] sm:min-h-0 inline-flex items-center"
                >
                  {r.unlocked ? "Open project" : "View & Unlock"}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
