import type { Place } from '../form/types';

/**
 * Geocoding through Komoot's public Photon API.
 * Free, no API key, CORS-enabled, tuned for type-as-you-search.
 * Docs: https://photon.komoot.io
 */
const PHOTON_SEARCH = 'https://photon.komoot.io/api/';
const PHOTON_REVERSE = 'https://photon.komoot.io/reverse';

interface PhotonFeature {
  geometry: { coordinates: [number, number] }; // [lng, lat]
  properties: Record<string, string | undefined>;
}

function buildLabel(p: Record<string, string | undefined>): string {
  const line1 = [p.name, p.housenumber].filter(Boolean).join(' ');
  const line2 = [p.street].filter(Boolean).join(' ');
  const line3 = [p.postcode, p.city || p.county].filter(Boolean).join(' ');
  const line4 = [p.state, p.country].filter(Boolean).join(', ');
  return [line1 || line2, line3, line4].filter(Boolean).join(', ');
}

function featureToPlace(f: PhotonFeature): Place | null {
  if (!Array.isArray(f.geometry?.coordinates)) return null;
  const [lng, lat] = f.geometry.coordinates;
  return { label: buildLabel(f.properties) || `${lat}, ${lng}`, lat, lng };
}

/** Forward geocoding: free text → ranked place candidates. */
export async function searchPlaces(
  query: string,
  opts: { lang?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = new URL(PHOTON_SEARCH);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(opts.limit ?? 6));
  url.searchParams.set('lang', opts.lang ?? 'en');

  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`Photon error ${res.status}`);

  const data: { features?: PhotonFeature[] } = await res.json();
  return (data.features ?? [])
    .map(featureToPlace)
    .filter((p): p is Place => p !== null);
}

/** Reverse geocoding: coordinates → nearest address (used when a pin is dragged). */
export async function reverseGeocode(
  lat: number,
  lng: number,
  opts: { lang?: string; signal?: AbortSignal } = {},
): Promise<Place | null> {
  const url = new URL(PHOTON_REVERSE);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('lang', opts.lang ?? 'en');

  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`Photon reverse error ${res.status}`);

  const data: { features?: PhotonFeature[] } = await res.json();
  const place = data.features?.[0] ? featureToPlace(data.features[0]) : null;
  // Keep the exact dropped coordinates; only adopt the resolved label.
  return place ? { label: place.label, lat, lng } : null;
}
