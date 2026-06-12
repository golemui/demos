import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import type { WithWidget, InputWidget } from '@golemui/core';
import { useInputWidget } from '@golemui/react';
import type { Place, RouteInfo, Stop, Trip } from '../form/types';
import { getRoute } from '../services/routing';
import { reverseGeocode } from '../services/geocoding';

interface RouteMapProps {
  tileUrl?: string;
  attribution?: string;
  height?: number;
  /** Stops are pushed in as a reactive runtime prop (see formDef.ts). */
  stops?: Stop[];
}

const DEFAULT_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const SPAIN: L.LatLngTuple = [40.4168, -3.7038];

interface ResolvedPoint extends Place {
  index: number; // index in the stops array
}

function numberedIcon(n: number): L.DivIcon {
  return L.divIcon({
    className: 'route-pin',
    html: `<span>${n}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
}

/**
 * Custom INPUT widget for the live route map.
 *
 * It READS the stops from a reactive runtime prop (`templateData.stops`, fed by
 * formDef.ts from `$form.trip.stops`) rather than from its bound value — runtime
 * props are re-evaluated on every form-data change, so the map updates whenever
 * any stop is added/edited, regardless of store path-propagation granularity.
 *
 * It WRITES back to its bound `trip` path via onValueChanged: dragging a marker
 * updates that stop's coordinates (then reverse-geocodes a fresh label), and the
 * computed OSRM `route` (distance / duration / geometry) is stored so the
 * markdown summary can read it reactively.
 */
export function RouteMap(widgetInstance: WithWidget) {
  const widget = widgetInstance.widget as InputWidget<Trip>;
  const { templateData, onValueChanged } =
    useInputWidget<Trip, RouteMapProps>(widget);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);

  // Route info drives the on-map overlay (state) and the write-back (ref).
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const routeInfoRef = useRef<RouteInfo | null>(null);
  routeInfoRef.current = routeInfo;

  // Latest stops (reactive runtime prop) + stable callback, for event closures.
  const stops = useMemo<Stop[]>(() => templateData.stops ?? [], [templateData.stops]);
  const stopsRef = useRef<Stop[]>(stops);
  stopsRef.current = stops;
  const onChangeRef = useRef(onValueChanged);
  onChangeRef.current = onValueChanged;

  const points: ResolvedPoint[] = useMemo(
    () =>
      stops
        .map((s, index) => (s.place ? { ...s.place, index } : null))
        .filter((p): p is ResolvedPoint => p !== null),
    [stops],
  );

  // Key that only changes when coordinates change — stops the route/marker
  // effects from re-firing when we merely write `route` back.
  const coordsKey = useMemo(
    () =>
      points
        .map((p) => `${p.index}:${p.lat.toFixed(6)},${p.lng.toFixed(6)}`)
        .join('|'),
    [points],
  );

  /** Write the whole trip back to the store (preserving the other half). */
  function writeTrip(nextStops: Stop[], route: RouteInfo | null) {
    onChangeRef.current({ stops: nextStops, route });
  }

  // 1) Init the Leaflet map exactly once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(SPAIN, 5);
    L.tileLayer(templateData.tileUrl ?? DEFAULT_TILES, {
      attribution: templateData.attribution ?? DEFAULT_ATTR,
      maxZoom: 19,
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      routeLayerRef.current = null;
    };
  }, [templateData.tileUrl, templateData.attribution]);

  // 2) Draw / update numbered draggable markers and fit the viewport.
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    points.forEach((p, ordinal) => {
      const marker = L.marker([p.lat, p.lng], {
        icon: numberedIcon(ordinal + 1),
        draggable: true,
        title: p.label,
      });
      marker.bindTooltip(`${ordinal + 1}. ${p.label}`, { direction: 'top' });
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        const apply = (place: Place) => {
          const next = stopsRef.current.map((s, i) =>
            i === p.index ? { place } : s,
          );
          writeTrip(next, routeInfoRef.current);
        };
        // Immediate coord update (keep label) so the route redraws right away…
        apply({ label: p.label, lat, lng });
        // …then resolve the new address and refresh the label, which flows
        // back into the repeater's address field.
        reverseGeocode(lat, lng)
          .then((place) => place && apply(place))
          .catch(() => {});
      });
      layer.addLayer(marker);
    });

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13, { animate: true });
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), {
        padding: [48, 48],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordsKey]);

  // 3) Ask OSRM for the real route, draw it, and store it back in `trip`.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (points.length < 2) {
      routeLayerRef.current?.remove();
      routeLayerRef.current = null;
      if (routeInfoRef.current !== null) {
        setRouteInfo(null);
        writeTrip(stopsRef.current, null);
      }
      return;
    }

    const controller = new AbortController();
    getRoute(points, { signal: controller.signal })
      .then((route) => {
        if (!route || !mapRef.current) return;
        routeLayerRef.current?.remove();
        routeLayerRef.current = L.polyline(route.geometry, {
          color: '#3b82f6',
          weight: 5,
          opacity: 0.9,
        }).addTo(mapRef.current);
        mapRef.current.fitBounds(L.latLngBounds(route.geometry), {
          padding: [48, 48],
        });
        setRouteInfo(route);
        writeTrip(stopsRef.current, route);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') console.warn('OSRM route failed', err);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordsKey]);

  return (
    <div className="routemap" style={{ flex: templateData.size }}>
      <div
        className="routemap__canvas"
        ref={containerRef}
        style={{ height: templateData.height ?? 440 }}
      />
      {routeInfo && (
        <div className="routemap__summary">
          <span className="material-icons">straighten</span>
          <strong>{routeInfo.distanceKm.toFixed(1)} km</strong>
          <span className="routemap__sep">·</span>
          <span className="material-icons">schedule</span>
          <strong>{Math.round(routeInfo.durationMin)} min</strong>
        </div>
      )}
      {points.length === 0 && (
        <div className="routemap__hint">Add addresses to draw your route</div>
      )}
    </div>
  );
}
