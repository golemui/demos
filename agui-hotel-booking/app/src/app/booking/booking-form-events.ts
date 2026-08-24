import type { FormEvent } from '@golemui/core';

/**
 * Host-side handlers for GolemUI form events dispatched by the agent-authored
 * booking form. The agent references these by NAME (`on: { change: ... }`); the
 * logic lives app-side and never round-trips through the LLM.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_NIGHTS = 30;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function handleBookingFormEvent(event: any): void {
  switch (event.name) {
    // Fired by the stay range picker's `on.change`: once an arrival (range
    // start) is chosen, cap the selectable end at 30 nights out — the
    // business rule lives host-side, not in the LLM-authored definition.
    case 'datesChanged': {
      // The range widget's value is an array of range objects [{ start, end }].
      const ranges = (event.data as { stay?: { dates?: Array<{ start?: string }> } }).stay?.dates;
      const startIso = ranges?.[0]?.start;
      const start = startIso ? new Date(startIso) : null;
      if (!start || Number.isNaN(start.getTime())) return;
      event.callback({
        type: 'OVERRIDE_WIDGET_PROP',
        payload: {
          path: 'stay.dates',
          prop: 'maxDate',
          value: iso(new Date(start.getTime() + MAX_NIGHTS * MS_PER_DAY)),
        },
      });
      break;
    }
    default:
      console.log(`[booking] unhandled form event '${event.name}'`, event.detail ?? event.data);
  }
}
