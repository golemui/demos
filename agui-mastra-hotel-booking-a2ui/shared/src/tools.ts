/**
 * Tool names shared by the server, its mock model and the app's inspector.
 *
 * The agent has two kinds of tools:
 *  - SERVER tools (Mastra runs them in-process): through them the agent relays
 *    what the guest typed into its forms to the hotel API.
 *  - render_a2ui, injected into every run by @ag-ui/a2ui-middleware: the agent
 *    calls it with a whole A2UI surface (components + data), and the middleware
 *    streams it to the browser as an `a2ui-surface` activity.
 */

export const SERVER_TOOL_NAMES = {
  checkAvailability: 'check_availability',
  quoteBooking: 'quote_booking',
  createBooking: 'create_booking',
  updateBooking: 'update_booking',
  createPayment: 'create_payment',
} as const;

/** The model's render tool, and the synthetic call that carries a UI action back to it. */
export const RENDER_A2UI_TOOL_NAME = 'render_a2ui';
export const LOG_A2UI_EVENT_TOOL_NAME = 'log_a2ui_event';
