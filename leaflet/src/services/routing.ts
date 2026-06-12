import type { Place, RouteInfo } from '../form/types';

/**
 * Real road routing through the public OSRM demo server.
 * Free, no API key, CORS-enabled.
 * Docs: http://project-osrm.org/docs/v5.24.0/api/
 */
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving/';

interface OsrmResponse {
  code: string;
  routes?: {
    distance: number; // metres
    duration: number; // seconds
    geometry: { coordinates: [number, number][] }; // [lng, lat][]
  }[];
}

export async function getRoute(
  points: Place[],
  opts: { signal?: AbortSignal } = {},
): Promise<RouteInfo | null> {
  if (points.length < 2) return null;

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = new URL(OSRM_URL + coords);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');

  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`OSRM error ${res.status}`);

  const data: OsrmResponse = await res.json();
  const route = data.routes?.[0];
  if (!route) return null;

  return {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    // OSRM returns [lng, lat]; Leaflet wants [lat, lng].
    geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
  };
}
