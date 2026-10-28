import type { FetchLike } from "./gmaps/client";

export interface GeocodeResult {
  lat: string;
  lon: string;
  displayName: string;
}

const USER_AGENT = "LeadFlow/0.1 (self-hosted lead console)";

/**
 * "Austin, TX" -> coordinates, via OpenStreetMap Nominatim. Its usage policy
 * asks for an identifying User-Agent and at most one request per second; a
 * scrape is started by hand, one at a time, so we stay well inside that.
 */
export async function geocode(place: string, fetchImpl: FetchLike = fetch): Promise<GeocodeResult | null> {
  const query = new URLSearchParams({ format: "json", limit: "1", q: place });
  const response = await fetchImpl(`https://nominatim.openstreetmap.org/search?${query}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Geocoding failed (HTTP ${response.status}).`);
  const hits = (await response.json()) as { lat: string; lon: string; display_name: string }[];
  if (hits.length === 0) return null;
  return { lat: String(hits[0].lat), lon: String(hits[0].lon), displayName: hits[0].display_name };
}
