import type { Tool } from '@ag-ui/core';
import type { HarnessToolRegistry } from '../agui/harness';
import { priceBooking, priceSummary } from './pricing';
import type { Booking } from './pricing';

/**
 * The business half of the harness for the hotel demo: the supervised tools.
 *
 * `confirm_booking` is the star of the talk: its JSON Schema alone drives the
 * whole review UI. The harness derives the form from `parameters` (dates,
 * guest count with min/max, board & car as labelled selects), pre-fills it with
 * the agent's proposal, and — because this entry declares a `summary` — shows a
 * live price breakdown above the fields, recomputed by host code (`pricing.ts`)
 * as the human edits. On approve, the tool result reports the human's edits as
 * a diff plus the host-computed total.
 *
 * (`process_payment` is added in the next stage as a custom, hand-built form.)
 */
export const CONFIRM_BOOKING_TOOL: Tool = {
  name: 'confirm_booking',
  description: `Show the guest their booking for review and confirmation. Propose every field from the conversation; the app prices it and lets the guest edit before confirming.

This action is NOT executed directly: the app renders your proposed booking as an editable review form with a live price breakdown. The tool result reports:
- { "status": "approved", "humanChanges": [...], "booking": {...}, "total": <number> } — the guest confirmed. humanChanges lists any field they changed (empty if confirmed as-is); acknowledge changes and the final total, then move on to payment.
- { "status": "rejected" } — the guest cancelled. Ask what they'd like to change.`,
  parameters: {
    type: 'object',
    properties: {
      // A date-range array — the harness renders this as ONE rangeDatePicker.
      dates: {
        type: 'array',
        title: 'Stay (arrival → departure)',
        items: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date' },
            end: { type: 'string', format: 'date' },
          },
          required: ['start', 'end'],
        },
      },
      guests: { type: 'number', title: 'Guests', minimum: 1, maximum: 4 },
      board: {
        title: 'Board',
        oneOf: [
          { const: 'none', title: 'No board' },
          { const: 'half', title: 'Half board (+€10/night per guest)' },
          { const: 'full', title: 'Full board (+€20/night per guest)' },
        ],
      },
      car: {
        title: 'Car rental',
        oneOf: [
          { const: 'none', title: 'No car' },
          { const: 'sport', title: 'Sports car — 2 seats (+€45/night)' },
          { const: 'compact', title: 'Compact — 4 seats (+€25/night)' },
          { const: 'suv', title: 'SUV — 5 seats (+€30/night)' },
        ],
      },
    },
    required: ['dates', 'guests', 'board', 'car'],
  },
};

/** Confirming a booking has no side effect here — it just prices the final selection. */
function confirmBooking(data: Record<string, unknown>): Record<string, unknown> {
  const quote = priceBooking(data as Booking);
  const bookingId = `BKG-2026-${String(Math.floor(1000 + Math.random() * 9000))}`;
  return { bookingId, total: quote.total, nights: quote.nights };
}

export const BOOKING_HARNESS_TOOLS: HarnessToolRegistry = {
  [CONFIRM_BOOKING_TOOL.name]: {
    tool: CONFIRM_BOOKING_TOOL,
    execute: confirmBooking,
    submitLabel: 'Confirm booking',
    // Host-side price breakdown shown above the fields and recomputed as the
    // guest edits. This is host code — the LLM never does the math. The
    // recomputed total after any edit also comes back with the diff.
    summary: (data) => priceSummary(data as Booking),
  },
};
