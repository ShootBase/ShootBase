/**
 * Server-side helpers that resolve the *effective* country filter for an
 * admin request.
 *
 * Lockdown rules (since admin country lockdown — June 2026):
 * - There is NO "all countries" view. Every admin request runs against
 *   exactly one country.
 * - Super admins choose via the country switcher (header `x-admin-country`);
 *   if unset/invalid, we default to "United Kingdom".
 * - Country-scoped staff are ALWAYS forced to their assigned country,
 *   ignoring any header override.
 *
 * Convention for new admin server functions:
 *   const scope = await resolveAdminCountry(supabase, userId);
 *   // for SELECT / UPDATE / DELETE list queries:
 *   q = applyCountryFilter(q, scope, "country");
 *   // for single-row mutations, ALWAYS verify before the write:
 *   assertRowInScope(scope, row.country);
 */
import { getRequestHeader } from "@tanstack/react-start/server";

export const COUNTRY_HEADER = "x-admin-country";
const DEFAULT_COUNTRY = "United Kingdom";
const VALID_COUNTRIES = new Set(["United Kingdom", "Nigeria"]);

export type EffectiveCountry = { kind: "one"; country: string };

export function getRequestedCountryHeader(): string | null {
  try {
    const v = getRequestHeader(COUNTRY_HEADER);
    if (!v) return null;
    const trimmed = String(v).trim();
    return trimmed.length ? trimmed : null;
  } catch {
    return null;
  }
}

export async function resolveAdminCountry(
  supabase: any,
  userId: string,
): Promise<EffectiveCountry> {
  const { data: row } = await supabase
    .from("staff_accounts")
    .select("role, country, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row || row.status !== "active") throw new Error("Forbidden");

  const requested = getRequestedCountryHeader();
  const isSuper = row.role === "super_admin";

  if (isSuper) {
    if (requested && VALID_COUNTRIES.has(requested)) {
      return { kind: "one", country: requested };
    }
    return { kind: "one", country: DEFAULT_COUNTRY };
  }

  const scope = row.country as string | null;
  if (!scope) throw new Error("Forbidden: no country assigned");
  // Header from a scoped staff is advisory; always force their country.
  return { kind: "one", country: scope };
}

/** Applies the country filter to a Supabase query builder. */
export function applyCountryFilter<T extends { eq: (col: string, val: any) => T }>(
  query: T,
  scope: EffectiveCountry,
  column = "country",
): T {
  return query.eq(column, scope.country);
}

/** Throws `country_forbidden` if the given record country is outside the scope. */
export function assertRowInScope(
  scope: EffectiveCountry,
  rowCountry: string | null | undefined,
) {
  if ((rowCountry ?? DEFAULT_COUNTRY) !== scope.country) {
    throw new Error("country_forbidden");
  }
}
