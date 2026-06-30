import { createMiddleware } from "@tanstack/react-start";
import { readAdminCountryFromStorage } from "@/lib/admin-country";

/**
 * Attaches the active admin country to every server function call as
 * `x-admin-country`. Server-side, `resolveAdminCountry` reads this header
 * and reconciles it with the caller's staff scope.
 *
 * Non-admin users simply send no header (or whatever they happen to have in
 * localStorage); server functions that don't use country filtering ignore it.
 */
export const attachAdminCountry = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const v = readAdminCountryFromStorage();
    return next({ headers: v ? { "x-admin-country": v } : {} });
  },
);
