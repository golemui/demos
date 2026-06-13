# Addresses → Live Map

> A declarative form that turns a list of addresses into draggable map pins and a real driving route — all from a single source of truth.

Add an address and a numbered pin drops on the map. Add a second and GolemUI
draws the **real driving route** between them (via OSRM). Drag a pin and its new
coordinates flow straight back into the form. One form state drives everything.

**Built with GolemUI · Leaflet · OSRM · Photon**

## What it shows off

- **Single source of truth** — the entire trip lives under one form path
  (`trip`); the map writes the route back into the store and the summary updates
  itself. No cross-widget event plumbing.
- **Repeaters** — `trip.stops` renders one autocomplete row per stop, with the
  engine resolving each row's index for you.
- **Third-party integration** — a custom input widget wraps a full Leaflet map
  inside the declarative form.
- **Reactive display widgets** — a summary widget reads `trip` and re-renders
  live, rendering markdown with marked + DOMPurify.

## Run it

```bash
npm install
npm run dev
```

`npm run build` runs the typecheck (`tsc -b`) + the production bundle.

## How it works

The whole trip lives under one form path:

```ts
trip = { stops: Stop[]; route: RouteInfo | null }
```

- **`addressAutocomplete`** (`src/widgets/AddressAutocomplete.tsx`) — bound to
  `trip.stops.items.place`. Owns its text input + debounced search against
  **Photon** (free geocoder, no API key); on selection writes `{ label, lat,
  lng }` to its path.
- **`routeMap`** (`src/widgets/RouteMap.tsx`) — bound to the whole `trip`.
  Initializes Leaflet once, renders numbered draggable markers, asks **OSRM** for
  the route, draws it, `fitBounds`, and **writes `trip.route` back** (distance,
  duration, geometry).
- **`routeSummary`** — a reactive custom display widget that reads `trip` and
  re-renders the summary.

**Anti-loop guard:** the OSRM effect writes `trip.route`, which changes `value`.
To avoid a feedback loop, effects depend on `coordsKey` (a hash of the
coordinates) — which doesn't change when `route` is written — and handlers read
the latest `trip` through a ref to dodge stale closures.

### External services

- Geocoder: [Komoot Photon](https://photon.komoot.io)
- Routing: [public OSRM](https://router.project-osrm.org)

## Learn more

- [GolemUI docs](https://golemui.com/dx/getting-started/installation/)
- [Form definition API](https://golemui.com/dx/form-definition-api/)
- [Widgets reference](https://golemui.com/dx/widgets-reference/)
