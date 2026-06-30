type Props = {
  memberSince?: string | null;
  successfulIntros?: number | null;
  responseRatePct?: number | null;
  avgResponseMinutes?: number | null;
  reviewsCount?: number | null;
  isVerified?: boolean | null;
};

function fmtResponse(min: number | null | undefined) {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function TrustStrip(p: Props) {
  const items: Array<[string, string]> = [
    ["Member since", p.memberSince ? new Date(p.memberSince).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"],
    ["Successful intros", String(p.successfulIntros ?? 0)],
    ["Response rate", p.responseRatePct != null ? `${p.responseRatePct}%` : "—"],
    ["Avg response", fmtResponse(p.avgResponseMinutes)],
    ["Reviews", String(p.reviewsCount ?? 0)],
    ["Status", p.isVerified ? "Verified" : "Listed"],
  ];
  return (
    <div className="border-y border-ink/10 grid grid-cols-2 md:grid-cols-6 divide-x divide-ink/10 mb-10">
      {items.map(([label, value]) => (
        <div key={label} className="px-4 py-4">
          <p className="text-[9px] font-mono uppercase tracking-widest text-ink/50">{label}</p>
          <p className="font-display text-lg mt-0.5">{value}</p>
        </div>
      ))}
    </div>
  );
}
