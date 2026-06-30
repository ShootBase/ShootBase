/**
 * Resolves the active country code for the current visitor and exposes
 * per-country configuration (currency, phone prefix, locale, support email).
 *
 * Resolution order (HIGHEST priority first — nothing may override the
 * preview override until the user explicitly exits it):
 *  1. Preview override (set by visiting `/ng`, `/preview/ng`, `/gb`, or
 *     `/preview/gb`). Stored in localStorage so it survives reloads,
 *     route changes, auth refreshes, and (optionally) new tabs.
 *  2. Hostname: any `*.ng` host → NG.
 *  3. Default → GB.
 *
 * The override is intentionally NEVER cleared automatically. It is only
 * removed by `setPreviewOverride(null)`, which is wired to `/gb`,
 * `/preview/gb`, and the floating "Exit" badge.
 */

// Primary store — survives reloads and route changes within the same browser.
export const PREVIEW_COUNTRY_KEY = "shootbase:preview-country";
// Legacy sessionStorage key (older builds). Read for back-compat, then migrated
// into localStorage on first detect so existing previews don't drop on reload.
const LEGACY_SESSION_KEY = "shootbase:preview-country";

export type CountryCode = "GB" | "NG";

export type CountryConfig = {
  code: CountryCode;
  name: string;
  currencyCode: "GBP" | "NGN";
  currencySymbol: "£" | "₦";
  locale: string;
  phonePrefix: string;
  supportEmail: string;
};

export const COUNTRY_CONFIGS: Record<CountryCode, CountryConfig> = {
  GB: {
    code: "GB",
    name: "United Kingdom",
    currencyCode: "GBP",
    currencySymbol: "£",
    locale: "en-GB",
    phonePrefix: "+44",
    supportEmail: "support@shootbase.co.uk",
  },
  NG: {
    code: "NG",
    name: "Nigeria",
    currencyCode: "NGN",
    currencySymbol: "₦",
    locale: "en-NG",
    phonePrefix: "+234",
    supportEmail: "support@shootbase.ng",
  },
};

// Toggle verbose logging via window.__SHOOTBASE_COUNTRY_DEBUG__ = true
function debug(...args: unknown[]) {
  if (typeof window === "undefined") return;
  try {
    // Default ON until the preview-mode bug is closed out — quiet by setting
    // window.__SHOOTBASE_COUNTRY_DEBUG__ = false.
    const flag = (window as unknown as { __SHOOTBASE_COUNTRY_DEBUG__?: boolean })
      .__SHOOTBASE_COUNTRY_DEBUG__;
    if (flag === false) return;
    // eslint-disable-next-line no-console
    console.log("[country]", ...args);
  } catch {}
}

export function getPreviewOverride(): CountryCode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PREVIEW_COUNTRY_KEY);
    if (v === "NG" || v === "GB") return v;
    // One-time migration from sessionStorage (older builds).
    const legacy = window.sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (legacy === "NG" || legacy === "GB") {
      window.localStorage.setItem(PREVIEW_COUNTRY_KEY, legacy);
      window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
      debug("migrated legacy session override →", legacy);
      return legacy;
    }
  } catch {}
  return null;
}

export function setPreviewOverride(code: CountryCode | null) {
  if (typeof window === "undefined") return;
  try {
    if (code) {
      window.localStorage.setItem(PREVIEW_COUNTRY_KEY, code);
      debug("preview override SET →", code);
    } else {
      window.localStorage.removeItem(PREVIEW_COUNTRY_KEY);
      // Also clear any stale session copy from older builds.
      try { window.sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch {}
      debug("preview override CLEARED");
    }
  } catch {}
}

export function detectCountryCode(): CountryCode {
  if (typeof window === "undefined") return "GB";
  const override = getPreviewOverride();
  if (override) {
    debug("detect → override", override);
    return override;
  }
  const host = window.location.hostname.toLowerCase();
  if (host.endsWith(".ng") || host === "shootbase.ng") {
    debug("detect → hostname NG", host);
    return "NG";
  }
  debug("detect → default GB", host);
  return "GB";
}

export function countryCodeToName(code: CountryCode): string {
  return COUNTRY_CONFIGS[code].name;
}

export function getCountryConfig(code?: CountryCode): CountryConfig {
  return COUNTRY_CONFIGS[code ?? detectCountryCode()];
}

/** True when the user is in a preview-override session (override differs
 *  from what the hostname would resolve to). */
export function isPreviewingOverride(): boolean {
  if (typeof window === "undefined") return false;
  const override = getPreviewOverride();
  if (!override) return false;
  const host = window.location.hostname.toLowerCase();
  const hostIsNg = host.endsWith(".ng") || host === "shootbase.ng";
  if (override === "NG" && !hostIsNg) return true;
  if (override === "GB" && hostIsNg) return true;
  return false;
}
