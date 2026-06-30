/**
 * Client-side admin country store.
 *
 * Lockdown rules: there is NO "all countries" view. The active value is
 * always a country name like "United Kingdom" or "Nigeria". Super admins
 * can switch; scoped staff are forced to their assigned country.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { StaffContext } from "@/lib/admin/permissions";

const STORAGE_KEY = "shootbase:admin-country";
const DEFAULT_COUNTRY = "United Kingdom";

type Ctx = {
  country: string;
  options: string[];
  /** True if the user has more than one option (i.e. is super admin). */
  canSwitch: boolean;
  setCountry: (next: string) => void;
};

const AdminCountryCtx = createContext<Ctx | null>(null);

export function AdminCountryProvider({
  staff,
  children,
}: {
  staff: StaffContext;
  children: React.ReactNode;
}) {
  const isSuper = staff.role === "super_admin";
  const options = staff.allowedCountries ?? [];

  const initial = useMemo<string>(() => {
    if (!isSuper) return staff.country ?? options[0] ?? DEFAULT_COUNTRY;
    if (typeof window === "undefined") return DEFAULT_COUNTRY;
    const url = new URL(window.location.href);
    const qp = url.searchParams.get("country");
    if (qp && options.includes(qp)) return qp;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && options.includes(stored)) return stored;
    return options[0] ?? DEFAULT_COUNTRY;
  }, [isSuper, staff.country, options]);

  const [country, setCountryState] = useState<string>(initial);

  const setCountry = useCallback(
    (next: string) => {
      if (!isSuper) return;
      if (!options.includes(next)) return;
      setCountryState(next);
      if (typeof window === "undefined") return;
      window.localStorage.setItem(STORAGE_KEY, next);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("country", next);
        window.history.replaceState({}, "", url.toString());
      } catch {}
      window.dispatchEvent(new CustomEvent("admin-country-change", { detail: next }));
    },
    [isSuper, options],
  );

  useEffect(() => {
    if (!isSuper || typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && e.newValue !== country) {
        setCountryState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isSuper, country]);

  const value = useMemo<Ctx>(
    () => ({ country, options, canSwitch: isSuper && options.length > 1, setCountry }),
    [country, options, isSuper, setCountry],
  );

  return <AdminCountryCtx.Provider value={value}>{children}</AdminCountryCtx.Provider>;
}

export function useAdminCountry(): Ctx {
  const v = useContext(AdminCountryCtx);
  if (!v) {
    return { country: DEFAULT_COUNTRY, options: [], canSwitch: false, setCountry: () => {} };
  }
  return v;
}

/** Reads the active country directly from localStorage. */
export function readAdminCountryFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
