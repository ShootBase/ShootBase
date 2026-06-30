import { useEffect, useState } from "react";

// Map budget_band id to a representative pound value (used for Hot/Warm/Cold).
function budgetValuePounds(band: string | null | undefined): number | null {
  if (!band) return null;
  switch (band) {
    case "under-200": return 150;
    case "200-500": return 350;
    case "500-1000": return 750;
    case "1000-2500": return 1750;
    case "2500+": return 3000;
    case "not-sure": return null;
    default: return null;
  }
}

export type LeadQuality = "hot" | "warm" | "cold" | null;

export function leadQuality(band: string | null | undefined): LeadQuality {
  const v = budgetValuePounds(band);
  if (v == null) return null;
  if (v > 500) return "hot";
  if (v >= 200) return "warm";
  return "cold";
}

export function leadQualityScore(q: LeadQuality): number {
  return q === "hot" ? 3 : q === "warm" ? 2 : q === "cold" ? 1 : 0;
}

export function LeadQualityBadge({ band, size = "sm" }: { band: string | null | undefined; size?: "sm" | "md" }) {
  const q = leadQuality(band);
  if (!q) return null;
  const map = {
    hot:  { label: "High Priority Project",  emoji: "🔥", cls: "bg-red-50 text-red-700 border-red-200" },
    warm: { label: "Recommended Project", emoji: "⚡", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    cold: { label: "Low Priority Project", emoji: "❄️", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  } as const;
  const x = map[q];
  const px = size === "md" ? "px-2.5 py-1 text-[15px]" : "px-2 py-1 text-[14px]";
  return (
    <span className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider border rounded ${px} ${x.cls}`}>
      <span aria-hidden>{x.emoji}</span>{x.label}
    </span>
  );
}

// ---- Freshness ----

export type Freshness = "fresh" | "active" | "aging" | "old";

export function freshnessOf(createdAtIso: string, now = Date.now()): Freshness {
  const minutes = (now - new Date(createdAtIso).getTime()) / 60000;
  if (minutes <= 30) return "fresh";
  if (minutes <= 180) return "active";
  if (minutes <= 1440) return "aging";
  return "old";
}

export function freshnessScore(f: Freshness): number {
  return f === "fresh" ? 4 : f === "active" ? 3 : f === "aging" ? 2 : 0;
}

export function formatPostedAgo(createdAtIso: string, now = Date.now()): string {
  const ms = now - new Date(createdAtIso).getTime();
  const m = Math.max(1, Math.floor(ms / 60000));
  if (m < 60) return `Posted ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Posted ${h}h ago`;
  const d = Math.floor(h / 24);
  return `Posted ${d}d ago`;
}

function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function FreshnessBadge({ createdAt, size = "sm" }: { createdAt: string; size?: "sm" | "md" }) {
  const now = useNow();
  const f = freshnessOf(createdAt, now);
  const map = {
    fresh:  { label: "Fresh Project",  emoji: "🔥", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    active: { label: "Active Project", emoji: "⚡", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    aging:  { label: "Closing Soon",  emoji: "❄️", cls: "bg-slate-100 text-slate-700 border-slate-200" },
    old:    { label: "Old Project",    emoji: "⏳", cls: "bg-stone-100 text-stone-600 border-stone-200" },
  } as const;
  const x = map[f];
  const px = size === "md" ? "px-2.5 py-1 text-[15px]" : "px-2 py-1 text-[14px]";
  return (
    <span
      title={formatPostedAgo(createdAt, now)}
      className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider border rounded ${px} ${x.cls}`}
    >
      <span aria-hidden>{x.emoji}</span>{x.label}
    </span>
  );
}

export function PostedAgo({ createdAt, className }: { createdAt: string; className?: string }) {
  const now = useNow();
  return <span className={className}>{formatPostedAgo(createdAt, now)}</span>;
}

// ---- Contacted counter ----

export function ContactedBadge({
  count, max, allowExtra, size = "sm",
}: {
  count: number; max: number; allowExtra?: boolean; size?: "sm" | "md";
}) {
  const cap = Math.max(1, max || 5);
  const shown = Math.min(count ?? 0, cap);
  const isFull = (count ?? 0) >= cap;
  const tone =
    isFull
      ? (allowExtra ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-red-50 text-red-700 border-red-200")
      : shown >= cap - 2
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-emerald-50 text-emerald-700 border-emerald-200";
  const px = size === "md" ? "px-2.5 py-1 text-[15px]" : "px-2 py-1 text-[14px]";
  return (
    <span
      title={isFull && allowExtra ? "Poster is open to more pros" : "Professionals contacted"}
      className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider border rounded ${px} ${tone}`}
    >
      <span>{shown}/{cap}</span>
      <span className="font-medium normal-case tracking-normal opacity-80">contacted</span>
      {isFull && allowExtra && <span className="normal-case tracking-normal opacity-80">· open</span>}
    </span>
  );
}
