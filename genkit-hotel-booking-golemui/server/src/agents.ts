import { genkit } from 'genkit/beta';
import { anthropic } from '@genkit-ai/anthropic';
import { a2ui, loadCatalog } from '@genkit-ai/a2ui';
import { BOOKING_REVIEW, CHECKOUT, CONTRACT_FORM, HOTEL_EVENTS, requestSchema, today } from '@hotel/shared';
import { hotelCatalog } from './catalogs';
import { ApiError, checkAvailability } from './hotel-service';
import { defineMockModel } from './mock-model';

export const MOCK = process.env.MOCK_AGENT === '1';
export const MODEL_ID = process.env.AGENT_MODEL ?? 'claude-sonnet-5-5';

/**
 * Interrupts and the Agents API only exist on the BETA Genkit instance — with
 * `import { genkit } from 'genkit'` they're undefined / throw at runtime.
 */
// Keys not scoped to a workspace must send `anthropic-workspace-id`. The
// plugin has no headers option, but the Anthropic SDK reads extra headers
// from ANTHROPIC_CUSTOM_HEADERS — accept the friendlier ANTHROPIC_WORKSPACE_ID too.
if (process.env.ANTHROPIC_WORKSPACE_ID && !process.env.ANTHROPIC_CUSTOM_HEADERS) {
  process.env.ANTHROPIC_CUSTOM_HEADERS = `anthropic-workspace-id: ${process.env.ANTHROPIC_WORKSPACE_ID}`;
}

export const ai = genkit({ plugins: MOCK ? [] : [anthropic()] }); // the plugin refuses to start without a key

// The catalog the agent may render, by lookup id (see catalogs.ts).
await loadCatalog(ai, { id: 'hotel', catalog: hotelCatalog });

const model = (MOCK ? defineMockModel(ai) : anthropic.model(MODEL_ID)) as ReturnType<typeof anthropic.model>;

// ---------------------------------------------------------------------------
// A server-side tool, against the in-memory hotel API. Its input schema is the
// contract's JSON Schema (`inputJsonSchema`), no zod mirror. Booking and paying
// are not tools: the app does them, from the BookingReview and the Checkout.
// ---------------------------------------------------------------------------

const safely = (run: () => unknown) => {
  try {
    return run();
  } catch (error) {
    if (error instanceof ApiError) return { status: 'error', problems: error.problems };
    throw error;
  }
};

const checkAvailabilityTool = ai.defineTool(
  {
    name: 'check_availability',
    description: 'Check whether the hotel has enough free rooms for a stay (POST /availability).',
    inputJsonSchema: requestSchema('checkAvailability') as never,
  },
  async (input) => safely(() => checkAvailability(input)),
);

// ---------------------------------------------------------------------------
// The agent. No `store`: client-managed state — every request carries the
// whole session.
// ---------------------------------------------------------------------------

export const concierge = ai.defineAgent({
  name: 'concierge',
  model,
  system: `You are the booking concierge of Hotel Aurora. Today is ${today()}.
Help guests book a stay. Be warm and brief: one or two sentences of prose, in
the guest's language, then the UI. Never ask for structured data in prose —
render a surface. Ask only for what you don't know yet. Rooms sleep up to 4;
stays are at most 30 nights. Board: none|half|full. Car: none|compact|suv|sport.
In \`\`\`a2ui blocks never write a "version" key — the system adds it.

Flow:
1. Render a ${CONTRACT_FORM} for the createBooking fields you still need, with
   prefill for what you can infer (e.g. "next week" → concrete dates; rooms from
   the number of guests).
2. When it is submitted, call check_availability.
3. If the guest mentioned special needs, render a ${CONTRACT_FORM} with exactly the
   matching specialRequests.* fields, pre-filled.
4. Render a ${BOOKING_REVIEW} with the full proposal. The app prices it, the guest
   may edit it, and the app creates the booking.
5. On "${HOTEL_EVENTS.bookingConfirmed}", acknowledge any humanChanges and render a
   ${CHECKOUT} with the booking id and total.
6. On "${HOTEL_EVENTS.paymentCompleted}", confirm warmly (brand + last4).

Changes before paying: if the guest closes the checkout ("${HOTEL_EVENTS.paymentCancelled}"),
ask whether they'd like to change anything in their booking. If they want a change
(then or any time before paying), render a ${CONTRACT_FORM} with operation
"updateBooking" and ONLY the fields to change, pre-filled with your suggestion;
then a ${BOOKING_REVIEW} with the updated full proposal AND the bookingId (the app
updates the existing booking — never create a second one); then a new ${CHECKOUT}.`,
  tools: [checkAvailabilityTool],
  use: [a2ui({ catalog: 'hotel' })],
});
