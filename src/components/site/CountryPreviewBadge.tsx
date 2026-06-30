/**
 * Floating badge shown whenever a preview override is active (e.g. a Super
 * Admin entered Nigeria mode via /ng on the UK domain). Provides a one-click
 * exit back to UK mode so it's always obvious which workspace is active.
 *
 * Re-evaluates on storage events so cross-tab toggles stay accurate, and on
 * pathname changes so navigating between routes never loses the indicator.
 */
import { useEffect, useState } from "react";
import {
  detectCountryCode,
  getCountryConfig,
  isPreviewingOverride,
  setPreviewOverride,
  PREVIEW_COUNTRY_KEY,
  type CountryCode,
} from "@/lib/country-detect";

export function CountryPreviewBadge() {
  const [show, setShow] = useState(false);
  const [code, setCode] = useState<CountryCode>("GB");

  useEffect(() => {
    function recompute() {
      const next = isPreviewingOverride();
      setShow(next);
      setCode(detectCountryCode());
      // eslint-disable-next-line no-console
      console.log("[CountryPreviewBadge] recompute", { show: next });
    }
    recompute();
    function onStorage(e: StorageEvent) {
      if (e.key === PREVIEW_COUNTRY_KEY) recompute();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", recompute);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", recompute);
    };
  }, []);

  if (!show) return null;
  const cfg = getCountryConfig(code);
  const flag = code === "NG" ? "🇳🇬" : "🇬🇧";

  function exit() {
    setPreviewOverride(null);
    try {
      window.localStorage.setItem(
        "shootbase:admin-country",
        code === "NG" ? "United Kingdom" : "Nigeria",
      );
    } catch {}
    window.location.replace("/");
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-3 rounded-full border border-ink/20 bg-ink text-paper px-4 py-2 shadow-lg">
      <span className="text-base leading-none" aria-hidden>
        {flag}
      </span>
      <span className="text-[11px] uppercase tracking-widest font-medium">
        Previewing {cfg.name} · {cfg.currencySymbol} {cfg.currencyCode}
      </span>
      <button
        onClick={exit}
        className="text-[10px] uppercase tracking-widest font-medium underline-offset-2 hover:underline"
      >
        Exit
      </button>
    </div>
  );
}
