import { getCountryConfig, detectCountryCode, type CountryCode } from "./country-detect";

export function formatPence(
  pence: number | null | undefined,
  countryCode?: CountryCode,
): string {
  if (pence == null) return "POA";
  const cfg = getCountryConfig(countryCode);
  const major = pence / 100;
  const hasMinor = pence % 100 !== 0;
  return new Intl.NumberFormat(cfg.locale, {
    style: "currency",
    currency: cfg.currencyCode,
    minimumFractionDigits: hasMinor ? 2 : 0,
    maximumFractionDigits: hasMinor ? 2 : 0,
  }).format(major);
}


export const BUDGET_BANDS = [
  { id: "under-200", label: "Under £200", min: 0, max: 20000 },
  { id: "200-500", label: "£200 – £500", min: 20000, max: 50000 },
  { id: "500-1000", label: "£500 – £1,000", min: 50000, max: 100000 },
  { id: "1000-2500", label: "£1,000 – £2,500", min: 100000, max: 250000 },
  { id: "2500+", label: "£2,500+", min: 250000, max: null as number | null },
  { id: "not-sure", label: "Not sure / need quotes", min: 0, max: null as number | null },
] as const;

// Nigerian labels (preview mode). IDs match BUDGET_BANDS so server-side
// lookups remain stable; only the display label changes.
const BUDGET_BAND_LABELS_NG: Record<string, string> = {
  "under-200": "Under ₦100,000",
  "200-500": "₦100,000 – ₦300,000",
  "500-1000": "₦300,000 – ₦750,000",
  "1000-2500": "₦750,000 – ₦2,000,000",
  "2500+": "₦2,000,000+",
  "not-sure": "Not sure / need quotes",
};

export function getBudgetBands(countryCode?: CountryCode) {
  const code = countryCode ?? detectCountryCode();
  if (code === "NG") {
    return BUDGET_BANDS.map((b) => ({ ...b, label: BUDGET_BAND_LABELS_NG[b.id] ?? b.label }));
  }
  return BUDGET_BANDS.map((b) => ({ ...b }));
}

export function budgetBandLabel(id: string | null | undefined, countryCode?: CountryCode): string | null {
  if (!id) return null;
  const bands = getBudgetBands(countryCode);
  return bands.find((b) => b.id === id)?.label ?? id;
}


export const DURATIONS = [
  { id: "1h", label: "1 Hour" },
  { id: "2h", label: "2 Hours" },
  { id: "3h", label: "3 Hours" },
  { id: "4h", label: "4 Hours" },
  { id: "5h", label: "5 Hours" },
  { id: "6h", label: "6 Hours" },
  { id: "7h", label: "7 Hours" },
  { id: "8h", label: "8 Hours" },
  { id: "half-day", label: "Half Day" },
  { id: "full-day", label: "Full Day" },
  { id: "multi-day", label: "Multiple Days" },
] as const;

export function durationLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  const found = DURATIONS.find((d) => d.id === id);
  if (found) return found.label;
  if (id === "1-2h") return "1–2 hours";
  return id;
}

export const PREFERRED_CONTACTS = [
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "either", label: "Either" },
] as const;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}
