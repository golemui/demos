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

const operationsGuide = ASKABLE_OPERATIONS.map(
  (operation) => `- ${operation} (${operationSummary(operation)}):\n${describeOperation(operation)}`,
).join('\n');

export const ASK_USER_TOOL: ToolDefinition = {
  name: 'ask_user',
  description: `Ask the guest for information with a form. The app renders a form GENERATED from the hotel API contract for the operation you name — you never design forms, you only decide WHAT to ask.

Operations and their fields:
${operationsGuide}

How to use it:
- "fields": ONLY the fields you still need, by name as listed above (sub-fields of a group by their dotted name, e.g. "specialRequests.babyCrib"). Never ask again for something the guest already told you and never ask for structured data in chat.
- "prefill": optional suggested values, in the API's shape (e.g. { "dates": { "start": "2026-10-19", "end": "2026-10-26" }, "specialRequests": { "babyCrib": true } }). The guest sees and can change them.
- "intro": one short line shown above the form.

The tool result is the submitted values in the API's shape, e.g. { "guests": 2, "specialRequests": { "parking": true } }.`,
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

export const CONFIRM_BOOKING_TOOL: ToolDefinition = {
  name: 'confirm_booking',
  description: `Propose the complete booking (createBooking request, including any specialRequests) for the guest to review. The app prices it in host code, shows a live breakdown and an editable form generated from the contract; nothing is created until the guest confirms — then the app calls POST /bookings itself.

The tool result is one of:
- { "status": "booked", "booking": { "id", "total", "nights" }, "humanChanges": [{ "path", "proposed", "approved" }] } — acknowledge any humanChanges and the final total in one line, then take the payment.
- { "status": "rejected" } — the guest cancelled; ask what they'd like to change.
- { "status": "error", "problems": [...] } — the API refused it; explain briefly and propose a fix.`,
  parameters: requestSchema('createBooking') as unknown as Record<string, unknown>,
};

export const COLLECT_PAYMENT_TOOL: ToolDefinition = {
  name: 'collect_payment',
  description: `Take the card payment of a booking. The app renders a secure card checkout; card details never reach you.

Call it with the booking id and the amount (EUR) from confirm_booking's result. The tool result is:
- { "status": "paid", "amount", "brand", "last4" } — confirm warmly with brand + last4 (never invent card details).
- { "status": "cancelled" } — ask how they'd like to proceed.`,
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

/** Server tool (runs inside Mastra) — named here so the mock model and the UI agree. */
export const CHECK_AVAILABILITY_TOOL_NAME = 'check_availability';
