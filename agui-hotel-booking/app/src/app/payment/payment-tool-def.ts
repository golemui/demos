import type { Tool } from '@ag-ui/core';

/**
 * The `collect_payment` frontend tool. Unlike render_form (LLM-authored form)
 * and confirm_booking (schema-derived approval form), this tool's UI is a
 * hand-crafted surface (the animated card checkout) that the app renders when
 * the call arrives — the agent only decides WHEN to charge and for how much.
 */
export const COLLECT_PAYMENT_TOOL: Tool = {
  name: 'collect_payment',
  description: `Collect the card payment for a confirmed booking. The application renders a secure card checkout to the guest; card details never reach you.

Call it with the amount (EUR, from confirm_booking's result.total) and a reference (the booking id). The tool result is either:
- { "status": "paid", "amount": ..., "brand": "visa", "last4": "4242" } — payment completed; confirm it warmly, mentioning the brand and last4 (never invent full card details).
- { "status": "cancelled" } — the guest closed the checkout; ask how they'd like to proceed.`,
  parameters: {
    type: 'object',
    properties: {
      amount: { type: 'number', title: 'Amount (EUR)', minimum: 0 },
      reference: { type: 'string', title: 'Reference', description: 'The booking id being paid' },
    },
    required: ['amount', 'reference'],
  },
};
