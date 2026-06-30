import { urgencyLabel } from "@/lib/urgency";

const TONE: Record<string, string> = {
  "asap": "bg-red-50 text-red-700 border-red-300",
  "3-days": "bg-orange-50 text-orange-700 border-orange-300",
  "1-week": "bg-amber-50 text-amber-800 border-amber-300",
  "2-weeks": "bg-ink/5 text-ink/70 border-ink/15",
  "1-month": "bg-ink/5 text-ink/70 border-ink/15",
  "flexible": "bg-ink/5 text-ink/50 border-ink/10",
};

export function UrgencyBadge({ urgency, className = "" }: { urgency: string | null | undefined; className?: string }) {
  if (!urgency) return null;
  const label = urgencyLabel(urgency) ?? urgency;
  const tone = TONE[urgency] ?? "bg-ink/5 text-ink/70 border-ink/15";
  const showHigh = urgency === "asap";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border rounded-sm ${tone} ${className}`}>
      {showHigh && <span aria-hidden>⚡</span>}
      {label}
    </span>
  );
}

export const URGENCY_FILTER_OPTIONS = [
  { id: "", label: "All urgency" },
  { id: "asap", label: "ASAP (24h)" },
  { id: "3-days", label: "Within 3 Days" },
  { id: "1-week", label: "Within 1 Week" },
  { id: "2-weeks", label: "Within 2 Weeks" },
  { id: "1-month", label: "Within 1 Month" },
  { id: "flexible", label: "Flexible" },
] as const;
