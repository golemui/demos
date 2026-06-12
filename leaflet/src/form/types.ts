// Shared data model for the "Direcciones -> Mapa en vivo" demo.

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

export interface Stop {
  place: Place | null;
}

export interface RouteInfo {
  /** Total driving distance in kilometres. */
  distanceKm: number;
  /** Total driving duration in minutes. */
  durationMin: number;
  /** Decoded polyline as [lat, lng] pairs, ready for Leaflet. */
  geometry: [number, number][];
}

/**
 * The whole trip lives under a single form path (`trip`). The map widget is
 * bound to it so it can (a) read every stop, and (b) write the OSRM `route`
 * back into the store after computing it. The markdown summary then reads
 * `trip.route` reactively. One source of truth, no cross-widget events.
 */
export interface Trip {
  stops: Stop[];
  route: RouteInfo | null;
}

export const emptyTrip = (count = 2): Trip => ({
  stops: Array.from({ length: count }, () => ({ place: null })),
  route: null,
});
