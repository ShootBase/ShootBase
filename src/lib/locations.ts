// Country-aware location dataset. Returns the right city list and lookup
// helpers based on the currently-active country (preview override aware).
import { detectCountryCode, type CountryCode } from "@/lib/country-detect";
import { UK_CITIES, findCity as findUkCity, type UkCity } from "@/lib/uk-cities";
import { NG_CITIES, findNgCity, type NgCity } from "@/lib/ng-cities";

export type AnyCity = {
  city: string;
  region: string;
  country: string;
  nearby?: string[];
};

export function getCitiesFor(code?: CountryCode): AnyCity[] {
  const c = code ?? detectCountryCode();
  return c === "NG" ? (NG_CITIES as AnyCity[]) : (UK_CITIES as AnyCity[]);
}

export function findLocation(
  name: string | null | undefined,
  code?: CountryCode,
): AnyCity | undefined {
  const c = code ?? detectCountryCode();
  return c === "NG" ? (findNgCity(name) as AnyCity | undefined) : (findUkCity(name) as UkCity | undefined);
}

export type { UkCity, NgCity };
