/**
 * Country-specific pricing overrides. The DB-stored `credit_settings` row holds
 * the UK (GB) pricing in pence (GBP). For Nigeria we override on the client
 * with NGN-denominated values so /ng and /preview/ng show Nigerian packages
 * without needing a DB migration of the canonical settings.
 *
 * Amounts are stored in MINOR units of the local currency:
 *  - GBP: pence (1/100 GBP) — handled by `formatPence` default.
 *  - NGN: kobo (1/100 NGN) — `formatPence(.., "NG")` formats as ₦.
 */
import type { CountryCode } from "./country-detect";

export type CountryPackage = {
  id: string;
  name: string;
  credits: number;
  price_pence: number; // minor units
  compare_at_pence?: number;
  featured?: boolean;
  description?: string;
};

export type CountrySubPlan = {
  price_id: string;
  name: string;
  credits: number;
  price_pence: number;
  interval: string;
};

// Nigeria pricing (NGN in kobo)
export const NG_PACKAGES: CountryPackage[] = [
  {
    id: "ng_starter",
    name: "Starter",
    credits: 50,
    price_pence: 6_000_000, // ₦60,000
    description: "50 coins to unlock customer projects",
  },
  {
    id: "ng_growth",
    name: "Growth",
    credits: 100,
    price_pence: 10_000_000, // ₦100,000
    featured: true,
    description: "100 coins · best value for active pros",
  },
  {
    id: "ng_pro",
    name: "Professional",
    credits: 200,
    price_pence: 15_000_000, // ₦150,000
    description: "200 coins for high-volume professionals",
  },
];

export const NG_SUB_PLAN: CountrySubPlan = {
  price_id: "ng_credits_monthly_sub",
  name: "Monthly",
  credits: 30,
  price_pence: 3_000_000, // ₦30,000
  interval: "month",
};

export function getCountryPackages(
  code: CountryCode,
  fallback: CountryPackage[],
): CountryPackage[] {
  if (code === "NG") return NG_PACKAGES;
  return fallback;
}

export function getCountrySubPlan(
  code: CountryCode,
  fallback: CountrySubPlan | null,
): CountrySubPlan | null {
  if (code === "NG") return NG_SUB_PLAN;
  return fallback;
}

export type PaymentMethod = "stripe" | "paystack" | "bank_transfer";

export function getPaymentMethods(code: CountryCode): PaymentMethod[] {
  if (code === "NG") return ["paystack", "bank_transfer"];
  return ["stripe"];
}

export function shouldShowVatNotice(code: CountryCode): boolean {
  return code === "GB";
}
