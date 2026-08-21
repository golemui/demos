import type { FormEvent } from '@golemui/core';

/**
 * Host-side handlers for GolemUI form events dispatched by agent-authored
 * claim forms. The agent references these by NAME (via `on: { change: ... }`
 * in the form definition); the data they work with is app-owned and never
 * round-trips through the LLM.
 */

const CITIES: Record<string, string[]> = {
  ES: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao'],
  NL: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven'],
  DE: ['Berlin', 'Munich', 'Hamburg', 'Cologne', 'Frankfurt'],
  FR: ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice'],
  GB: ['London', 'Manchester', 'Birmingham', 'Edinburgh', 'Bristol'],
  IT: ['Rome', 'Milan', 'Naples', 'Turin', 'Florence'],
};

export function handleClaimFormEvent(event: FormEvent): void {
  switch (event.name) {
    // Fired by the country select's `on.change` AND the city select's `on.load`
    // (so a form pre-filled with a country gets its city options immediately).
    case 'countryChanged': {
      const country = (event.data as { incident?: { country?: string } }).incident?.country;
      const cities = (country && CITIES[country]) || [];
      event.callback({
        type: 'OVERRIDE_WIDGET_PROP',
        payload: {
          path: 'incident.city',
          prop: 'options',
          value: cities.map((city) => ({ label: city, value: city })),
        },
      });
      break;
    }
    default:
      console.log(`[claims] unhandled form event '${event.name}'`, event.detail ?? event.data);
  }
}
