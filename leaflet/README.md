# Addresses → Live Map (GolemUI + Leaflet)

A GolemUI demo: a declarative form where every address you type drops a numbered
pin on a Leaflet map and, with two or more points, draws the **real driving
route** (OSRM). Pins are draggable and write their coordinates back to the form.

## Run

```bash
npm install
npm run dev
```

`npm run build` runs the typecheck (`tsc -b`) + the production bundle.

## How it's wired

The whole trip lives under a single form path, `trip`:

```ts
trip = { stops: Stop[]; route: RouteInfo | null }
```

- **Repeater** (`trip.stops`) → one row per stop. Each row mounts the custom
  autocomplete widget.
- **`addressAutocomplete`** (custom input widget, `src/widgets/AddressAutocomplete.tsx`)
  bound to `trip.stops.items.place`. It owns its own text input + debounced
  search against **Photon** (free geocoder, no API key) and, on selection, writes
  `{ label, lat, lng }` to its path. Because it's an input widget, the engine
  resolves the per-row index for us.
- **`routeMap`** (custom input widget, `src/widgets/RouteMap.tsx`) bound to the
  whole `trip` object. It initializes Leaflet **once**, renders numbered draggable
  markers, asks **OSRM** for the route, draws it, calls `fitBounds`, and **writes
  `trip.route` back** into the store (distance, duration, geometry).
- A reactive **`routeSummary`** custom display widget reads `trip` (including
  `trip.route`) and re-renders the summary, parsing markdown with **marked +
  DOMPurify**. (The built-in `markdownText` shortcut isn't handled by the React
  adapter in this version, so we render markdown in our own display widget.)

One source of truth (`trip`) and everything flows through the store: no
cross-widget event plumbing. The map writes the route → the summary updates by
itself.

### Map anti-loop guards

The OSRM effect writes `trip.route`, which changes `value`. To avoid recomputing
in a loop, the effects depend on `coordsKey` (a hash of the coordinates), which
does **not** change when `route` is written. Handlers read the latest `trip`
through a ref to avoid stale closures.

## External services (free, no key)

- Geocoder: Komoot Photon — `https://photon.komoot.io`
- Routing: public OSRM — `https://router.project-osrm.org`

Both are CORS-enabled and free to use. If you host this publicly and worry about
rate limits, both are self-hostable; just change the URLs in `src/services/`.

## Worth testing in the browser

The build and typecheck pass. What's worth checking by hand (needs rendering):

1. The dual binding `trip` (map) + `trip.stops` (repeater) stays in sync.
2. Dragging a pin updates the stop and recomputes the route.
3. Photon/OSRM respond (real calls from the browser).
