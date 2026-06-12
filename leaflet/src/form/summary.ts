import type { Trip } from './types';

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** Builds the markdown rendered by the reactive `markdownText` summary widget. */
export function buildSummary(trip: Trip | undefined): string {
  const stops = trip?.stops ?? [];
  const resolved = stops.filter((s) => s.place);

  if (resolved.length === 0) {
    return [
      '## Your route',
      '',
      'Start typing an address above to drop the first point on the map.',
    ].join('\n');
  }

  const list = resolved
    .map((s, i) => `${i + 1}. ${s.place!.label}`)
    .join('\n');

  const lines = ['## Your route', '', list, ''];

  if (trip?.route) {
    const { distanceKm, durationMin } = trip.route;
    lines.push(
      '---',
      '',
      `**Total distance:** ${distanceKm.toFixed(1)} km  `,
      `**Estimated time:** ${fmtDuration(durationMin)}`,
    );
  } else if (resolved.length === 1) {
    lines.push('_Add a second point to calculate the route._');
  }

  return lines.join('\n');
}
