import { genkit } from 'genkit/beta';
import { anthropic } from '@genkit-ai/anthropic';
import { a2ui, loadCatalog } from '@genkit-ai/a2ui';
import { bookingProblems, priceBooking, requestSchema, today } from '@hotel/shared';
import { basicCatalog } from './catalogs';
import { ApiError, checkAvailability, createBooking, createPayment, updateBooking } from './hotel-service';
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
await loadCatalog(ai, { id: 'basic', catalog: basicCatalog });

const model = (MOCK ? defineMockModel(ai) : anthropic.model(MODEL_ID)) as ReturnType<typeof anthropic.model>;

// ---------------------------------------------------------------------------
// Tools — server-side, against the in-memory hotel API: through them the agent
// relays what the guest typed into its forms. Input schemas are the contract's
// JSON Schemas (`inputJsonSchema`), no zod mirror.
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

const createBookingTool = ai.defineTool(
  {
    name: 'create_booking',
    description:
      'Create the booking (POST /bookings) once the guest confirmed. Returns { id, total, nights, ... } priced by the hotel, or { status: "error", problems }.',
    inputJsonSchema: requestSchema('createBooking') as never,
  },
  async (input) => safely(() => createBooking(input)),
);

const quoteBookingTool = ai.defineTool(
  {
    name: 'quote_booking',
    description: 'Price a booking without creating it. Returns { nights, lines: [{ label, amount }], total } in EUR.',
    inputJsonSchema: requestSchema('createBooking') as never,
  },
  async (input) => {
    const problems = bookingProblems(input as never);
    return problems.length > 0 ? { status: 'error', problems } : priceBooking(input as never);
  },
);

const updateBookingTool = ai.defineTool(
  {
    name: 'update_booking',
    description:
      'Change an unpaid booking (PATCH /bookings/{bookingId}). Pass the booking id and ONLY the fields to change. Returns the repriced booking.',
    inputJsonSchema: {
      type: 'object',
      properties: { bookingId: { type: 'string' }, changes: requestSchema('updateBooking') as object },
      required: ['bookingId', 'changes'],
    } as never,
  },
  async (input) => {
    const { bookingId, changes } = input as { bookingId: string; changes: unknown };
    return safely(() => updateBooking(bookingId, changes));
  },
);

const createPaymentTool = ai.defineTool(
  {
    name: 'create_payment',
    description:
      'Charge a booking (POST /payments). Pass the card BRAND (visa, mastercard, amex…) and the LAST 4 digits only — never the full number.',
    inputJsonSchema: requestSchema('createPayment') as never,
  },
  async (input) => safely(() => createPayment(input)),
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
1. Render a form for the booking details (dates, guests, rooms, board, car) with
   the basic catalog, pre-filled with what you know, with validation checks.
2. When it is submitted, call check_availability.
3. If the guest mentioned special needs (baby crib, accessible room, parking +
   license plate, arrival time, dietary needs, notes), render a form for exactly
   those.
4. Call quote_booking and render a review card with the price lines, the total
   and Confirm / Change buttons. Never compute prices yourself.
5. On confirm, call create_booking with the booking (specialRequests included).
6. Render a card payment form (cardholder, card number, expiry, CVC). On pay,
   call create_payment with the booking id, total, card brand and last 4 digits.
7. Confirm warmly.

Changes before paying: if the guest wants to change anything after the booking
exists, render a form for just those fields, call update_booking with the
booking id and only the changed fields (never create_booking again), then show
the new total and the payment form again.`,
  tools: [checkAvailabilityTool, quoteBookingTool, createBookingTool, updateBookingTool, createPaymentTool],
  use: [a2ui({ catalog: 'basic' })],
});
