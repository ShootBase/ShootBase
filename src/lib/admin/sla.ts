export type SlaPriority = "low" | "medium" | "high" | "urgent";
export type SlaStatus = "on_track" | "due_soon" | "overdue" | "met";

export interface SlaTicket {
  status?: string | null;
  priority?: SlaPriority | null;
  created_at?: string | null;
  first_response_due_at?: string | null;
  resolution_due_at?: string | null;
  first_responded_at?: string | null;
  resolved_at?: string | null;
}

export interface SlaMetric {
  status: SlaStatus;
  /** ms until deadline (negative if overdue) */
  msRemaining: number | null;
  /** ISO deadline */
  dueAt: string | null;
  /** Whether the SLA target was met (responded/resolved before due) */
  met: boolean;
}

export interface SlaSummary {
  response: SlaMetric;
  resolution: SlaMetric;
  /** Worst-of the two metrics — drives the row badge */
  overall: SlaStatus;
}

const PRIORITY_LABEL: Record<SlaPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export function priorityLabel(p?: SlaPriority | null): string {
  return p ? PRIORITY_LABEL[p] : "Medium";
}

function classify(
  now: number,
  startIso: string | null | undefined,
  dueIso: string | null | undefined,
  metIso: string | null | undefined,
): SlaMetric {
  if (!dueIso) {
    return { status: "on_track", msRemaining: null, dueAt: null, met: false };
  }
  const due = new Date(dueIso).getTime();
  if (metIso) {
    const met = new Date(metIso).getTime() <= due;
    return { status: "met", msRemaining: due - now, dueAt: dueIso, met };
  }
  const start = startIso ? new Date(startIso).getTime() : due - 3600_000;
  const total = Math.max(1, due - start);
  const remaining = due - now;
  let status: SlaStatus;
  if (remaining < 0) status = "overdue";
  else if (remaining / total < 0.5) status = "due_soon";
  else status = "on_track";
  return { status, msRemaining: remaining, dueAt: dueIso, met: false };
}

const WORST: Record<SlaStatus, number> = {
  met: 0,
  on_track: 1,
  due_soon: 2,
  overdue: 3,
};

export function computeSla(t: SlaTicket, nowMs: number = Date.now()): SlaSummary {
  const response = classify(
    nowMs,
    t.created_at,
    t.first_response_due_at,
    t.first_responded_at,
  );
  const resolution = classify(
    nowMs,
    t.created_at,
    t.resolution_due_at,
    t.resolved_at ?? (t.status === "resolved" || t.status === "closed" ? new Date(nowMs).toISOString() : null),
  );
  const overall: SlaStatus =
    WORST[response.status] >= WORST[resolution.status] ? response.status : resolution.status;
  return { response, resolution, overall };
}

export function formatCountdown(ms: number | null): string {
  if (ms === null) return "—";
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const sign = ms < 0 ? "-" : "";
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${sign}${d}d ${rh}h`;
  }
  return `${sign}${h}h ${m.toString().padStart(2, "0")}m`;
}

export const SLA_LABEL: Record<SlaStatus, string> = {
  met: "Met",
  on_track: "On Track",
  due_soon: "Due Soon",
  overdue: "Overdue",
};

export const SLA_DOT: Record<SlaStatus, string> = {
  met: "bg-emerald-500",
  on_track: "bg-emerald-500",
  due_soon: "bg-amber-500",
  overdue: "bg-red-500",
};

export const PRIORITY_BADGE: Record<SlaPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  urgent: "bg-red-500/15 text-red-700 dark:text-red-300",
};

export type Sentiment = "positive" | "neutral" | "frustrated" | "angry";

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  frustrated: "Frustrated",
  angry: "Angry",
};

export const SENTIMENT_BADGE: Record<Sentiment, string> = {
  positive: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  neutral: "bg-muted text-muted-foreground",
  frustrated: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  angry: "bg-red-500/15 text-red-700 dark:text-red-300",
};
