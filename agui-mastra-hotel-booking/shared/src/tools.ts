import { ASKABLE_OPERATIONS } from './hotel-api';
import { describeOperation, operationSummary, requestSchema } from './forms';

/**
 * The frontend tools — declared by the app on every AG-UI run (`RunAgentInput.tools`)
 * and executed in the browser. Their descriptions and schemas are derived from
 * the hotel contract, so the agent's view of the API can't drift from the UI's.
 *
 * Plain objects in AG-UI's `Tool` shape ({ name, description, parameters }), so
 * this package needs no AG-UI dependency.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const operationsGuide = `- createBooking (${operationSummary('createBooking')}):
${describeOperation('createBooking')}
- updateBooking (${operationSummary('updateBooking')}): the same fields, all optional — ask ONLY the ones the guest wants to change.`;

export const ASK_USER_TOOL: ToolDefinition = {
  name: 'ask_user',
  description: `Ask the guest for information with a form. The app renders a form GENERATED from the hotel API contract for the operation you name — you never design forms, you only decide WHAT to ask.

Operations and their fields:
${operationsGuide}

How to use it:
- "fields": ONLY the fields you still need, by name as listed above (sub-fields of a group by their dotted name, e.g. "specialRequests.babyCrib"). Never ask again for something the guest already told you and never ask for structured data in chat.
- "prefill": optional suggested values, in the API's shape (e.g. { "dates": { "start": "2026-10-19", "end": "2026-10-26" }, "specialRequests": { "babyCrib": true } }). The guest sees and can change them.
- "intro": one short line shown above the form.

The tool result is the submitted values in the API's shape, e.g. { "guests": 2, "specialRequests": { "parking": true } }, or { "status": "dismissed" } if the guest wrote in the chat instead.`,
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: [...ASKABLE_OPERATIONS] },
      fields: { type: 'array', items: { type: 'string' }, description: 'Fields to ask for, e.g. "rooms" or "specialRequests.parking"' },
      prefill: { type: 'object', description: 'Suggested values in the API shape' },
      intro: { type: 'string' },
      submitLabel: { type: 'string', description: 'Short submit button label, e.g. "Continue"' },
    },
    required: ['operation', 'fields'],
  },
};

const bookingSchema = requestSchema('createBooking');

export const CONFIRM_BOOKING_TOOL: ToolDefinition = {
  name: 'confirm_booking',
  description: `Propose the complete booking (createBooking request, including any specialRequests) for the guest to review. The app prices it in host code, shows a live breakdown and an editable form generated from the contract; nothing is created until the guest confirms — then the app calls POST /bookings itself.

To CHANGE an existing unpaid booking, pass the full updated proposal AND its "bookingId": the app then updates that booking (PATCH /bookings/{bookingId}) instead of creating a second one.

The tool result is one of:
- { "status": "booked", "booking": { "id", "total", "nights" }, "humanChanges": [{ "path", "proposed", "approved" }] } — acknowledge any humanChanges and the final total in one line, then take the payment.
- { "status": "rejected" } — the guest cancelled; ask what they'd like to change.
- { "status": "error", "problems": [...] } — the API refused it; explain briefly and propose a fix.
- { "status": "dismissed" } — the guest wrote in the chat instead.`,
  parameters: {
    ...bookingSchema,
    properties: {
      ...bookingSchema.properties,
      bookingId: { type: 'string', description: 'Only when changing an existing unpaid booking: its id.' },
    },
  } as unknown as Record<string, unknown>,
};

export const COLLECT_PAYMENT_TOOL: ToolDefinition = {
  name: 'collect_payment',
  description: `Take the card payment of a booking. The app renders a secure card checkout; card details never reach you.

Call it with the booking id and the amount (EUR) from confirm_booking's result. The tool result is:
- { "status": "paid", "amount", "brand", "last4" } — confirm warmly with brand + last4 (never invent card details).
- { "status": "cancelled" } — the guest closed the checkout: ask whether they'd like to change anything in their booking before paying.
- { "status": "dismissed" } — the guest wrote in the chat instead.`,
  parameters: {
    type: 'object',
    properties: {
      bookingId: { type: 'string' },
      amount: { type: 'number', minimum: 0 },
    },
    required: ['bookingId', 'amount'],
  },
};

export const FRONTEND_TOOLS = [ASK_USER_TOOL, CONFIRM_BOOKING_TOOL, COLLECT_PAYMENT_TOOL];

/**
 * The answer the app gives a frontend tool call left open when the guest writes
 * in the chat instead: every tool call needs a result before the next run.
 */
export const DISMISSED_RESULT = { status: 'dismissed', note: 'The guest wrote in the chat instead of using this form.' } as const;

/** Server tool (runs inside Mastra) — named here so the mock model and the UI agree. */
export const CHECK_AVAILABILITY_TOOL_NAME = 'check_availability';

/**
 * The two variants of the demo, each its own agent behind its own AG-UI endpoint:
 *  - golem: the agent picks operation + fields; forms come from the OpenAPI (frontend tools above)
 *  - pure:  the agent designs every form in A2UI (render_a2ui, via @ag-ui/a2ui-middleware)
 */
export const VARIANTS = ['pure', 'golem'] as const;
export type Variant = (typeof VARIANTS)[number];

/** Pure A2UI variant: server tools through which the LLM relays the guest's answers to the API. */
export const PURE_TOOL_NAMES = {
  quoteBooking: 'quote_booking',
  createBooking: 'create_booking',
  updateBooking: 'update_booking',
  createPayment: 'create_payment',
} as const;

/** Injected by @ag-ui/a2ui-middleware: the model's render tool, and the synthetic call that carries a UI action. */
export const RENDER_A2UI_TOOL_NAME = 'render_a2ui';
export const LOG_A2UI_EVENT_TOOL_NAME = 'log_a2ui_event';
