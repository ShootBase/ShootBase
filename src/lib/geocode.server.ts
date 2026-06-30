// Server-only geocoding helper. Resolves a free-text UK location string
// (postcode, city, or postcode+city) to lat/lng using public services:
//   1. postcodes.io     — exact UK postcodes, very fast, no key.
//   2. Nominatim (OSM)  — fallback for city names, with a Shootbase UA.
// Failure is always non-fatal: returns null and the caller stores null lat/lng.

const UK_POSTCODE_RE =
  /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

type GeoResult = { lat: number; lng: number } | null;

async function geocodePostcode(postcode: string): Promise<GeoResult> {
  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: { latitude?: number; longitude?: number };
    };
    const r = json.result;
    if (typeof r?.latitude === "number" && typeof r?.longitude === "number") {
      return { lat: r.latitude, lng: r.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodePlace(query: string): Promise<GeoResult> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${query}, United Kingdom`);
    url.searchParams.set("format", "json");
    url.searchParams.set("countrycodes", "gb");
    url.searchParams.set("limit", "1");
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Shootbase/1.0 (https://www.shootbase.co.uk)",
        "Accept-Language": "en-GB",
      },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!arr.length) return null;
    const lat = parseFloat(arr[0].lat);
    const lng = parseFloat(arr[0].lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  } catch {
    return null;
  }
}

/**
 * Try postcode first, then city. Either input can be empty.
 */
export async function geocodeUk(
  postcode: string | null | undefined,
  city: string | null | undefined,
): Promise<GeoResult> {
  const pc = (postcode ?? "").trim();
  if (pc && UK_POSTCODE_RE.test(pc)) {
    const hit = await geocodePostcode(pc);
    if (hit) return hit;
  }
  const c = (city ?? "").trim();
  if (c) {
    const hit = await geocodePlace(c);
    if (hit) return hit;
  }
  // last-ditch: try a non-strict postcode lookup
  if (pc) {
    const hit = await geocodePostcode(pc);
    if (hit) return hit;
  }
  return null;
}
