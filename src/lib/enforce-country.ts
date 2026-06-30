/**
 * Cross-country access enforcement.
 *
 * GB and NG are run as two isolated marketplaces under one codebase. A user
 * whose profile is country=Nigeria must NOT be able to use the GB platform
 * (and vice-versa). Detection is delegated to `detectCountryCode()` which
 * already honours the hostname + `/preview/*` override.
 *
 * Behaviour:
 *  - If the profile has no country yet (OAuth users — the auth trigger
 *    defaults to United Kingdom only when meta is empty, but OAuth users
 *    sign up via providers that strip our metadata, so we backfill here
 *    once on first login from the active country).
 *  - If the profile's country matches the platform, allow.
 *  - If it mismatches, return { ok:false, profileCountry, platformCountry }.
 *
 * Super Admins are exempt — they own the country switcher.
 */
import { supabase } from "@/integrations/supabase/client";
import { detectCountryCode } from "@/lib/country-detect";

export type CountryCheck =
  | { ok: true }
  | { ok: false; profileCountry: "Nigeria" | "United Kingdom"; platformCountry: "Nigeria" | "United Kingdom" };

export async function enforceCountryAccess(userId: string): Promise<CountryCheck> {
  const platformCountry = detectCountryCode() === "NG" ? "Nigeria" : "United Kingdom";

  // Super Admins bypass — they use the country switcher in the admin UI.
  try {
    const { data: isSuper } = await supabase.rpc("is_super_admin", { _uid: userId });
    if (isSuper === true) return { ok: true };
  } catch { /* fall through */ }

  const { data: prof } = await supabase
    .from("profiles")
    .select("country")
    .eq("id", userId)
    .maybeSingle();

  const profileCountry = (prof?.country ?? null) as string | null;

  // Backfill: OAuth sign-up didn't carry metadata → first authenticated
  // visit pins the account to the platform they actually signed up on.
  if (!profileCountry) {
    await supabase.from("profiles").update({ country: platformCountry } as never).eq("id", userId);
    return { ok: true };
  }

  if (profileCountry === platformCountry) return { ok: true };
  return {
    ok: false,
    profileCountry: profileCountry === "Nigeria" ? "Nigeria" : "United Kingdom",
    platformCountry,
  };
}
