export const URGENCY_OPTIONS = [
  { id: "asap", label: "ASAP (Within 24 Hours)" },
  { id: "3-days", label: "Within 3 Days" },
  { id: "1-week", label: "Within 1 Week" },
  { id: "2-weeks", label: "Within 2 Weeks" },
  { id: "1-month", label: "Within 1 Month" },
  { id: "flexible", label: "Flexible" },
] as const;

export type UrgencyId = (typeof URGENCY_OPTIONS)[number]["id"];

export function urgencyLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return URGENCY_OPTIONS.find((u) => u.id === id)?.label ?? id;
}

/**
 * Pricing rule: 8 coins by default, 10 coins for premium leads
 * (duration >= 6 hours OR budget over £500).
 */
const PREMIUM_BUDGETS = new Set(["500-1000", "1000-2500", "2500+"]);

export function leadContactCost(opts: {
  durationHours?: number | null;
  budgetBand?: string | null;
}): number {
  const isPremium =
    (opts.durationHours != null && opts.durationHours >= 6) ||
    (opts.budgetBand != null && PREMIUM_BUDGETS.has(opts.budgetBand));
  return isPremium ? 10 : 8;
}

export function isPremiumLead(opts: {
  durationHours?: number | null;
  budgetBand?: string | null;
}): boolean {
  return leadContactCost(opts) === 10;
}
