import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Mastra } from '@mastra/core';
import { InMemoryStore } from '@mastra/core/storage';
import { createAnthropic } from '@ai-sdk/anthropic';
import { bookingProblems, priceBooking, requestSchema, SERVER_TOOL_NAMES, today } from '@hotel/shared';
import { ApiError, checkAvailability, createBooking, createPayment, updateBooking } from './hotel-service';
import { createMockModel } from './mock-model';

export const MOCK = process.env.MOCK_AGENT === '1';
export const MODEL_ID = process.env.AGENT_MODEL ?? 'claude-sonnet-5-5';

/**
 * The concierge designs every form itself with render_a2ui (injected by
 * @ag-ui/a2ui-middleware, along with the basic catalog's schema, see
 * server.ts) and relays the answers to the hotel API through the server tools
 * below.
 */
const instructions = () => `You are the booking concierge of Hotel Aurora. Today is ${today()}.

Help guests book a stay through a chat that can render A2UI surfaces. Be warm and
brief: one or two sentences of prose, in the guest's language, then the UI. Never
ask for structured data in prose — render a surface with render_a2ui, using only
the basic catalog's components and props. Ask only for what you don't know yet.
Rooms sleep up to 4; stays are at most 30 nights. Board: none|half|full.
Car: none|compact|suv|sport.

When the guest submits a surface you receive a log_a2ui_event tool result:
'User performed action "<name>" … Context: {…}' with the values from your form.

Flow:
1. Render a form for the booking details (dates, guests, rooms, board, car),
   pre-filled with what you know, with validation checks.
2. When it is submitted, call ${SERVER_TOOL_NAMES.checkAvailability}.
3. If the guest mentioned special needs (baby crib, accessible room, parking +
   license plate, arrival time, dietary needs, notes), render a form for exactly
   those.
4. Call ${SERVER_TOOL_NAMES.quoteBooking} and render a review card with the price
   lines, the total and Confirm / Change buttons. Never compute prices yourself.
5. On confirm, call ${SERVER_TOOL_NAMES.createBooking} with the booking
   (specialRequests included).
6. Render a card payment form (cardholder, card number, expiry, CVC). On pay, call
   ${SERVER_TOOL_NAMES.createPayment} with the booking id, total, card brand and last 4 digits.
7. Confirm warmly.

Changes before paying: if the guest wants to change anything after the booking
exists, render a form for just those fields, call ${SERVER_TOOL_NAMES.updateBooking}
with the booking id and only the changed fields (never ${SERVER_TOOL_NAMES.createBooking}
again), then show the new total and the payment form again.`;

/**
 * SERVER tools: Mastra runs them in-process and AG-UI streams each call and
 * its result to the browser. Their input schemas are the contract's request
 * schemas — plain JSON Schema, no hand-written zod mirror. The agent has to
 * translate what its forms send back (their own shape) into these.
 */
const checkAvailabilityTool = createTool({
  id: SERVER_TOOL_NAMES.checkAvailability,
  description: 'Check whether the hotel has enough free rooms for a stay (POST /availability).',
  inputSchema: requestSchema('checkAvailability') as never,
  execute: async (input: unknown) => safely(() => checkAvailability(input)),
});

const quoteBookingTool = createTool({
  id: SERVER_TOOL_NAMES.quoteBooking,
  description: 'Price a booking without creating it. Returns { nights, lines: [{ label, amount }], total } in EUR, or { error }.',
  inputSchema: requestSchema('createBooking') as never,
  execute: async (input: unknown) => {
    const problems = bookingProblems(input as never);
    return problems.length > 0 ? { error: problems } : priceBooking(input as never);
  },
});

const createBookingTool = createTool({
  id: SERVER_TOOL_NAMES.createBooking,
  description:
    'Create the booking (POST /bookings) once the guest confirmed. Returns { id, total, nights, ... } priced by the hotel, or { error }.',
  inputSchema: requestSchema('createBooking') as never,
  execute: async (input: unknown) => safely(() => createBooking(input)),
});

const updateBookingTool = createTool({
  id: SERVER_TOOL_NAMES.updateBooking,
  description:
    'Change an unpaid booking (PATCH /bookings/{bookingId}). Pass the booking id and ONLY the fields to change. Returns the repriced booking, or { error }.',
  inputSchema: {
    type: 'object',
    properties: { bookingId: { type: 'string' }, changes: requestSchema('updateBooking') },
    required: ['bookingId', 'changes'],
  } as never,
  execute: async (input: unknown) => {
    const { bookingId, changes } = input as { bookingId: string; changes: unknown };
    return safely(() => updateBooking(bookingId, changes));
  },
});

const createPaymentTool = createTool({
  id: SERVER_TOOL_NAMES.createPayment,
  description:
    'Charge a booking (POST /payments). Pass the card BRAND (visa, mastercard, amex…) and the LAST 4 digits only — never the full number.',
  inputSchema: requestSchema('createPayment') as never,
  execute: async (input: unknown) => safely(() => createPayment(input)),
});

/** API errors go back to the model as data ({ error }), so it can explain them and try again. */
function safely(run: () => unknown) {
  try {
    return run();
  } catch (error) {
    if (error instanceof ApiError) return { error: error.problems };
    throw error;
  }
}

/**
 * An API key that isn't scoped to a workspace must name one on every request
 * (`anthropic-workspace-id`); set ANTHROPIC_WORKSPACE_ID for those keys.
 */
const anthropic = createAnthropic({
  headers: process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : undefined,
});

const concierge = new Agent({
  id: 'concierge',
  name: 'Hotel Aurora concierge',
  instructions,
  model: MOCK ? createMockModel() : anthropic(MODEL_ID),
  tools: {
    [SERVER_TOOL_NAMES.checkAvailability]: checkAvailabilityTool,
    [SERVER_TOOL_NAMES.quoteBooking]: quoteBookingTool,
    [SERVER_TOOL_NAMES.createBooking]: createBookingTool,
    [SERVER_TOOL_NAMES.updateBooking]: updateBookingTool,
    [SERVER_TOOL_NAMES.createPayment]: createPaymentTool,
  },
});

/**
 * No database: the conversation lives in the browser (AG-UI sends the whole
 * history on every run) and Mastra's own bookkeeping uses an in-memory store.
 */
export const mastra = new Mastra({
  agents: { concierge },
  storage: new InMemoryStore(),
});
