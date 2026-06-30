// Event types for Event Photography / Event Videography categories.
// Single source of truth — used by post-job forms and lead matching display.
export const EVENT_TYPES = [
  "Birthday Party",
  "Private Party",
  "Graduation",
  "Religious Event",
  "Concert & Music Event",
  "Festival & Cultural Event",
  "Fashion Show",
  "Sports Event",
  "Funeral & Memorial",
  "Other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function isEventCategory(serviceName?: string | null): boolean {
  if (!serviceName) return false;
  return /^event\s+(photography|videography)$/i.test(serviceName);
}
