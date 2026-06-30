import { type CountryCode } from "@/lib/country-detect";

/**
 * Distance unit by active country.
 *  - GB → miles
 *  - NG → kilometres
 *
 * Existing data (pro service radius, miles_between SQL) is always stored in
 * miles. Display layers should convert with `toDisplayDistance()` and label
 * with `distanceUnit()`.
 */
export function distanceUnit(code: CountryCode): "mi" | "km" {
  return code === "NG" ? "km" : "mi";
}

export function distanceUnitLong(code: CountryCode, plural = true): string {
  if (code === "NG") return plural ? "kilometres" : "kilometre";
  return plural ? "miles" : "mile";
}

const MILES_TO_KM = 1.609344;

export function toDisplayDistance(miles: number, code: CountryCode): number {
  return code === "NG" ? miles * MILES_TO_KM : miles;
}

export function fromDisplayDistance(value: number, code: CountryCode): number {
  return code === "NG" ? value / MILES_TO_KM : value;
}

export function formatDistance(miles: number, code: CountryCode): string {
  const v = toDisplayDistance(miles, code);
  const unit = code === "NG" ? "km" : "mi";
  const long = code === "NG" ? "kilometres" : "miles";
  if (v < 1) return code === "NG" ? "Under 1 km away" : "Under 1 mile away";
  if (v < 10) return `${v.toFixed(1)} ${long} away`;
  return `${Math.round(v)} ${unit === "km" ? "km" : long} away`;
}
