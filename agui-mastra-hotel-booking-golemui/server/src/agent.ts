import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Mastra } from '@mastra/core';
import { InMemoryStore } from '@mastra/core/storage';
import { createAnthropic } from '@ai-sdk/anthropic';
import { CHECK_AVAILABILITY_TOOL_NAME, requestSchema, today } from '@hotel/shared';
import { ApiError, checkAvailability } from './hotel-service';
import { createMockModel } from './mock-model';

export const MOCK = process.env.MOCK_AGENT === '1';
export const MODEL_ID = process.env.AGENT_MODEL ?? 'claude-sonnet-5-5';

/**
 * Note what is NOT in these instructions: no widget types, no form layouts, no
 * validators, no step-by-step script. The forms come from the API contract (see
 * the ask_user tool description, generated from the OpenAPI); the agent only
 * decides what to ask, when, and with which suggested values.
 */
const instructions = () => `You are the booking concierge of Hotel Aurora. Today is ${today()}.

Help guests book a stay through a chat that can render forms. Be warm and brief:
one or two sentences outside of forms, in the guest's language.

- Collect booking details with ask_user (operation createBooking). Ask only for
  what you don't know yet; suggest sensible values via prefill (e.g. "next week"
  → concrete dates, rooms from the number of guests). Never ask for structured
  data in chat.
- Once you know the dates and rooms, check them with ${CHECK_AVAILABILITY_TOOL_NAME}.
- If the guest mentioned special needs (a baby, accessibility, parking, a late
  arrival, dietary needs…), ask about exactly those with ask_user — only the
  matching specialRequests.* fields, pre-filled with what they told you — so
  they become part of the booking.
- Then call confirm_booking with the full proposal, specialRequests included.
  The app prices it and the guest reviews it — never quote prices yourself
  before that.
- After a booking, take the payment with collect_payment.
- Changes before paying: if the guest closes the checkout, ask whether they'd
  like to change anything in their booking. If they want a change (then or any
  time before paying), ask_user with operation updateBooking and ONLY the fields
  to change, pre-filled with your suggestion; then confirm_booking with the full
  updated proposal AND the bookingId (the app updates that booking — never
  create a second one); then collect_payment again with the new total.
- One tool call per response.`;

/**
 * A SERVER tool: Mastra runs it in-process and AG-UI streams the call and its
 * result to the browser. Its input schema is the contract's request schema —
 * plain JSON Schema, no hand-written zod mirror.
 */
const checkAvailabilityTool = createTool({
  id: CHECK_AVAILABILITY_TOOL_NAME,
  description: 'Check whether the hotel has enough free rooms for a stay (POST /availability).',
  inputSchema: requestSchema('checkAvailability') as never,
  execute: async (input: unknown) => safely(() => checkAvailability(input)),
});

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
  tools: { [CHECK_AVAILABILITY_TOOL_NAME]: checkAvailabilityTool },
});

/**
 * No database: the conversation lives in the browser (AG-UI sends the whole
 * history on every run) and Mastra's own bookkeeping uses an in-memory store.
 */
export const mastra = new Mastra({
  agents: { concierge },
  storage: new InMemoryStore(),
});
