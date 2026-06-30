import { useEffect, useState } from "react";
import { ProAvatar } from "@/components/pro/ProAvatar";
import { myInvitedPros, type InvitedPro } from "@/lib/contact-requests.functions";

function statusLabel(s: InvitedPro["status"]): { label: string; cls: string } {
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

export function InvitedProsList({ jobId }: { jobId: string }) {
  const [pros, setPros] = useState<InvitedPro[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void myInvitedPros({ data: { job_id: jobId } }).then((rows) => {
      if (!cancelled) setPros(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (pros === null) return <p className="text-xs text-ink/55">Loading…</p>;
  if (pros.length === 0)
    return <p className="text-xs text-ink/55">No professionals invited yet.</p>;

  return (
    <ul className="divide-y divide-ink/10 border border-ink/10">
      {pros.map((p) => {
        const s = statusLabel(p.status);
        return (
          <li key={p.id} className="flex items-center gap-3 p-3">
            <ProAvatar
              proId={p.professional_id}
              hasAvatar={!!p.avatar_path}
              name={p.business_name}
              size="md"
              shape="square"
            />
            <div className="min-w-0 flex-1">
              <p className="font-display text-base truncate">{p.business_name || "Professional"}</p>
              <p className="text-[11px] uppercase tracking-widest text-ink/55">
                {p.city || "—"} · invited{" "}
                {new Date(p.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            </div>
            <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 ${s.cls}`}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
