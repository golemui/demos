import { MockLanguageModelV4 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import { addDays, CHECK_AVAILABILITY_TOOL_NAME, LOG_A2UI_EVENT_TOOL_NAME, PURE_TOOL_NAMES, RENDER_A2UI_TOOL_NAME, today } from '@hotel/shared';
import type { BookingRequest, SpecialRequests } from '@hotel/shared';

/**
 * MOCK_AGENT=1 — the scripted model of the PURE A2UI variant.
 *
 * Only the MODEL is fake. It designs every surface itself and calls
 * render_a2ui, the tool @ag-ui/a2ui-middleware injects — so the real
 * middleware streams the surfaces, the real Mastra agent runs the server
 * tools, and the browser's A2UI renderer validates what comes out. UI actions
 * come back as the middleware's synthetic `log_a2ui_event` tool results.
 *
 * What it writes is what an LLM writes with the basic catalog: inputs bound
 * to its own data model, `checks` for validation, and values in the FORM's
 * shape (string numbers, single-choice arrays, split dates) that it then has
 * to translate into the API's shape before calling the server tools.
 */

type PromptMessage = { role: string; content: unknown };
type Part = { type: string; text?: string; toolName?: string; toolCallId?: string; input?: unknown; output?: { type: string; value: unknown } };

interface Turn {
  text: string;
  tool?: { name: string; args: Record<string, unknown> };
}

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

let callCounter = 0;

export function createPureMockModel() {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'scripted-pure-concierge',
    doStream: async (options) => {
      const turn = pureScript(read(options.prompt as unknown as PromptMessage[]));
      const id = `mock-pure-text-${++callCounter}`;
      const chunks: unknown[] = [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id }];
      for (const word of turn.text.split(/(?<= )/)) chunks.push({ type: 'text-delta', id, delta: word });
      chunks.push({ type: 'text-end', id });
      if (turn.tool) {
        chunks.push({ type: 'tool-call', toolCallId: `mock-pure-call-${callCounter}`, toolName: turn.tool.name, input: JSON.stringify(turn.tool.args) });
      }
      chunks.push({
        type: 'finish',
        usage,
        finishReason: turn.tool ? { unified: 'tool-calls', raw: 'tool_use' } : { unified: 'stop', raw: 'end_turn' },
      });
      return { stream: simulateReadableStream({ chunks: chunks as never[], initialDelayInMs: 250, chunkDelayInMs: 25 }) };
    },
  });
}

// ---------------------------------------------------------------------------
// The script
// ---------------------------------------------------------------------------

function pureScript(conversation: Conversation): Turn {
  const { last, said, needs } = conversation;

  if (last.kind === 'user') {
    if (conversation.paid) return { text: 'Anything else? Your booking is all set.' };
    // A booking exists but isn't paid: the guest is asking for a change.
    if (conversation.booking && !conversation.repairRequested) {
      const car = requestedCar(conversation.lastUserText);
      if (!car) return { text: 'Sure — what would you like to change?' };
      return { text: "Of course — let's update your booking.", tool: render(carChangeForm(car)) };
    }
    // The app reported a surface the renderer rejected: render it again, fixed.
    if (conversation.repairRequested) return { text: 'Sorry about that — here it is again.', tool: render(bookingForm(said, conversation.userText)) };
    // "…slider…" reproduces a real Claude mistake: a Slider with `step`, which
    // the basic catalog doesn't have and web_core's strict schema rejects.
    const form = bookingForm(said, conversation.userText);
    return { text: "Happy to help! Just a few details and you're set.", tool: render(/slider/i.test(conversation.userText) ? withGuestSlider(form) : form) };
  }

  if (last.kind === 'action') {
    const booking = collected(conversation);
    switch (last.action.name) {
      case 'booking_details':
        return { text: 'Let me check availability… ', tool: { name: CHECK_AVAILABILITY_TOOL_NAME, args: { dates: booking.dates, rooms: booking.rooms } } };
      case 'special_requests':
      case 'change_booking':
        return { text: 'Pricing it… ', tool: { name: PURE_TOOL_NAMES.quoteBooking, args: booking } };
      case 'confirm_booking':
        return { text: 'Booking it… ', tool: { name: PURE_TOOL_NAMES.createBooking, args: booking } };
      case 'booking_changes': {
        // The form's own shape (a single-choice array) → the API's.
        const changes = (last.action.context.changes ?? {}) as { car?: string[] };
        return {
          text: 'Updating your booking… ',
          tool: { name: PURE_TOOL_NAMES.updateBooking, args: { bookingId: conversation.booking?.id, changes: { car: changes.car?.[0] ?? 'none' } } },
        };
      }
      case 'pay': {
        // The whole card came through the agent; it keeps only brand + last 4.
        const card = (last.action.context.card ?? {}) as { number?: string };
        const digits = String(card.number ?? '').replace(/\D/g, '');
        const created = conversation.booking as { id: string; total: number };
        return {
          text: 'Charging the card… ',
          tool: { name: PURE_TOOL_NAMES.createPayment, args: { bookingId: created.id, amount: created.total, brand: brandOf(digits), last4: digits.slice(-4) } },
        };
      }
    }
  }

  if (last.kind === 'tool') {
    const output = last.output as Record<string, unknown> & { error?: string[] };
    if (output?.error) return { text: `The hotel refused it: ${output.error.join(' ')} Shall we change something?` };
    switch (last.name) {
      case CHECK_AVAILABILITY_TOOL_NAME: {
        const availability = output as { available?: boolean; roomsLeft?: number };
        if (!availability.available) return { text: `Sorry — only ${availability.roomsLeft} room(s) left on those dates. Other dates?` };
        if (needs.fields.length === 0) return { text: 'Pricing it… ', tool: { name: PURE_TOOL_NAMES.quoteBooking, args: collected(conversation) } };
        return { text: "Good news, we have rooms. Let's add what you mentioned.", tool: render(specialRequestsForm(needs)) };
      }
      case PURE_TOOL_NAMES.quoteBooking:
        return { text: 'Here is your booking:', tool: render(reviewCard(output as { lines?: Array<{ label: string; amount: number }>; total?: number })) };
      case PURE_TOOL_NAMES.createBooking: {
        const created = output as { id?: string; total?: number };
        return { text: `Booking ${created.id} is reserved. Last step, the payment:`, tool: render(paymentForm(created.total ?? 0)) };
      }
      case PURE_TOOL_NAMES.updateBooking: {
        const updated = output as { id?: string; total?: number };
        return { text: `Done — booking ${updated.id} now comes to €${(updated.total ?? 0).toFixed(2)}.`, tool: render(paymentForm(updated.total ?? 0)) };
      }
      case PURE_TOOL_NAMES.createPayment: {
        const paid = output as { payment?: { brand: string; last4: string } };
        return { text: `Payment received on your ${paid.payment?.brand} ending ${paid.payment?.last4}. See you at Hotel Aurora!` };
      }
    }
  }

  return { text: 'Sorry, I lost track — what do you need?' };
}

// ---------------------------------------------------------------------------
// The surfaces it designs — render_a2ui arguments: { surfaceId, components, data }
// ---------------------------------------------------------------------------

interface Surface {
  surfaceId: string;
  components: Array<Record<string, unknown>>;
  data?: Record<string, unknown>;
}

let surfaceCounter = 0;

type SurfaceDraft = Omit<Surface, 'surfaceId'> & { name: string };

function render(surface: SurfaceDraft): Turn['tool'] {
  const { name, ...rest } = surface;
  return { name: RENDER_A2UI_TOOL_NAME, args: { surfaceId: `${name}-${++surfaceCounter}`, ...rest } };
}

const required = (path: string) => ({ call: 'required', args: { value: { path } } });
const options = (pairs: string[][]) => pairs.map(([value, label]) => ({ value, label }));

function bookingForm(said: Partial<BookingRequest>, userText: string): SurfaceDraft {
  const dates = suggestedDates(userText);
  return {
    name: 'booking-details',
    components: [
      { id: 'root', component: 'Card', child: 'form' },
      { id: 'form', component: 'Column', children: ['title', 'dates', 'counts', 'board', 'car', 'submit'] },
      { id: 'title', component: 'Text', text: 'Your stay', variant: 'h3' },
      { id: 'dates', component: 'Row', children: ['arrival', 'departure'] },
      { id: 'arrival', component: 'DateTimeInput', label: 'Arrival', value: { path: '/booking/arrival' }, enableDate: true, min: today(), weight: 1 },
      { id: 'departure', component: 'DateTimeInput', label: 'Departure', value: { path: '/booking/departure' }, enableDate: true, min: today(), weight: 1 },
      { id: 'counts', component: 'Row', children: ['guests', 'rooms'] },
      {
        id: 'guests',
        component: 'TextField',
        label: 'Guests',
        variant: 'number',
        value: { path: '/booking/guests' },
        weight: 1,
        // Not `numeric`: a TextField stores strings, and numeric() rejects them.
        checks: [{ condition: { call: 'regex', args: { value: { path: '/booking/guests' }, pattern: '^([1-9]|1[0-2])$' } }, message: 'Between 1 and 12 guests' }],
      },
      {
        id: 'rooms',
        component: 'TextField',
        label: 'Rooms',
        variant: 'number',
        value: { path: '/booking/rooms' },
        weight: 1,
        checks: [{ condition: { call: 'regex', args: { value: { path: '/booking/rooms' }, pattern: '^[1-3]$' } }, message: 'Between 1 and 3 rooms' }],
      },
      { id: 'board', component: 'ChoicePicker', label: 'Board', variant: 'mutuallyExclusive', value: { path: '/booking/board' }, options: options([['none', 'Room only'], ['half', 'Half board'], ['full', 'Full board']]) },
      { id: 'car', component: 'ChoicePicker', label: 'Rental car', variant: 'mutuallyExclusive', value: { path: '/booking/car' }, options: options([['none', 'No car'], ['compact', 'Compact'], ['suv', 'SUV'], ['sport', 'Sports car']]) },
      { id: 'submit_label', component: 'Text', text: 'Continue' },
      {
        id: 'submit',
        component: 'Button',
        child: 'submit_label',
        variant: 'primary',
        checks: [
          {
            condition: { call: 'and', args: { values: ['arrival', 'departure', 'guests', 'rooms'].map((field) => required(`/booking/${field}`)) } },
            message: 'Fill in the dates, guests and rooms',
          },
        ],
        action: { event: { name: 'booking_details', context: { booking: { path: '/booking' } } } },
      },
    ],
    data: {
      booking: {
        arrival: dates?.start ?? '',
        departure: dates?.end ?? '',
        guests: said.guests ? String(said.guests) : '',
        rooms: said.guests ? String(Math.ceil(said.guests / 4)) : '',
        board: [said.board ?? 'none'],
        car: ['none'],
      },
    },
  };
}

/** The booking form with a guests Slider carrying `step` — invalid for web_core. */
function withGuestSlider(form: SurfaceDraft): SurfaceDraft {
  // A valid binding (so the middleware's validation passes — it checks component
  // names, required props and bindings, not unknown props) plus the extra `step`.
  form.components = form.components.map((component) =>
    component['id'] === 'guests' ? { id: 'guests', component: 'Slider', label: 'Guests', min: 1, max: 12, step: 1, value: { path: '/booking/guestsCount' } } : component,
  );
  const booking = form.data?.booking as Record<string, unknown>;
  booking.guestsCount = Number(booking.guests) || 2;
  return form;
}

function specialRequestsForm(needs: { fields: string[]; prefill: SpecialRequests }): SurfaceDraft {
  const labels: Record<string, string> = {
    babyCrib: 'Baby crib in the room',
    accessibleRoom: 'Step-free, accessible room',
    parking: 'Reserve a parking space',
    licensePlate: 'License plate',
  };
  return {
    name: 'special-requests',
    components: [
      { id: 'root', component: 'Card', child: 'form' },
      { id: 'form', component: 'Column', children: ['title', ...needs.fields, 'submit'] },
      { id: 'title', component: 'Text', text: 'Special requests', variant: 'h3' },
      ...needs.fields.map((field) =>
        field === 'licensePlate'
          ? { id: field, component: 'TextField', label: labels[field], value: { path: `/requests/${field}` } }
          : { id: field, component: 'CheckBox', label: labels[field], value: { path: `/requests/${field}` } },
      ),
      { id: 'submit_label', component: 'Text', text: 'Add to my booking' },
      { id: 'submit', component: 'Button', child: 'submit_label', variant: 'primary', action: { event: { name: 'special_requests', context: { specialRequests: { path: '/requests' } } } } },
    ],
    data: { requests: { ...Object.fromEntries(needs.fields.map((field) => [field, field === 'licensePlate' ? '' : false])), ...needs.prefill } },
  };
}

function reviewCard(quote: { lines?: Array<{ label: string; amount: number }>; total?: number }): SurfaceDraft {
  const lines = (quote.lines ?? []).map((line, index) => ({ id: `line${index}`, component: 'Text', text: `${line.label} — €${line.amount.toFixed(2)}` }));
  return {
    name: 'review',
    components: [
      { id: 'root', component: 'Card', child: 'body' },
      { id: 'body', component: 'Column', children: ['title', ...lines.map((line) => line.id), 'divider', 'total', 'actions'] },
      { id: 'title', component: 'Text', text: 'Review your booking', variant: 'h3' },
      ...lines,
      { id: 'divider', component: 'Divider' },
      { id: 'total', component: 'Text', text: `**Total: €${(quote.total ?? 0).toFixed(2)}**` },
      { id: 'actions', component: 'Row', children: ['change', 'confirm'], justify: 'end' },
      { id: 'change_label', component: 'Text', text: 'Change something' },
      { id: 'change', component: 'Button', child: 'change_label', variant: 'borderless', action: { event: { name: 'change_booking' } } },
      { id: 'confirm_label', component: 'Text', text: 'Confirm booking' },
      { id: 'confirm', component: 'Button', child: 'confirm_label', variant: 'primary', action: { event: { name: 'confirm_booking' } } },
    ],
  };
}

function carChangeForm(suggested: string): SurfaceDraft {
  return {
    name: 'booking-changes',
    components: [
      { id: 'root', component: 'Card', child: 'form' },
      { id: 'form', component: 'Column', children: ['title', 'car', 'submit'] },
      { id: 'title', component: 'Text', text: 'Add a rental car', variant: 'h3' },
      { id: 'car', component: 'ChoicePicker', label: 'Rental car', variant: 'mutuallyExclusive', value: { path: '/changes/car' }, options: options([['none', 'No car'], ['compact', 'Compact'], ['suv', 'SUV'], ['sport', 'Sports car']]) },
      { id: 'submit_label', component: 'Text', text: 'Update booking' },
      { id: 'submit', component: 'Button', child: 'submit_label', variant: 'primary', action: { event: { name: 'booking_changes', context: { changes: { path: '/changes' } } } } },
    ],
    data: { changes: { car: [suggested] } },
  };
}

function paymentForm(total: number): SurfaceDraft {
  return {
    name: 'payment',
    components: [
      { id: 'root', component: 'Card', child: 'form' },
      { id: 'form', component: 'Column', children: ['title', 'holder', 'number', 'row', 'submit'] },
      { id: 'title', component: 'Text', text: `Payment — €${total.toFixed(2)}`, variant: 'h3' },
      { id: 'holder', component: 'TextField', label: 'Cardholder name', value: { path: '/card/holder' }, checks: [{ condition: required('/card/holder'), message: 'Required' }] },
      {
        id: 'number',
        component: 'TextField',
        label: 'Card number',
        value: { path: '/card/number' },
        checks: [{ condition: { call: 'regex', args: { value: { path: '/card/number' }, pattern: '^[0-9 ]{13,23}$' } }, message: 'Enter a card number' }],
      },
      { id: 'row', component: 'Row', children: ['expiry', 'cvc'] },
      { id: 'expiry', component: 'TextField', label: 'Expiry (MM/YY)', value: { path: '/card/expiry' }, weight: 1 },
      { id: 'cvc', component: 'TextField', label: 'CVC', variant: 'obscured', value: { path: '/card/cvc' }, weight: 1 },
      { id: 'submit_label', component: 'Text', text: `Pay €${total.toFixed(2)}` },
      { id: 'submit', component: 'Button', child: 'submit_label', variant: 'primary', action: { event: { name: 'pay', context: { card: { path: '/card' } } } } },
    ],
    data: { card: { holder: '', number: '', expiry: '', cvc: '' } },
  };
}

// ---------------------------------------------------------------------------
// Reading the conversation
// ---------------------------------------------------------------------------

type Last =
  | { kind: 'user' }
  | { kind: 'action'; action: { name: string; context: Record<string, unknown> } }
  | { kind: 'tool'; name: string; output: unknown };

interface Conversation {
  last: Last;
  /** The guest's latest chat message. */
  lastUserText: string;
  booking?: { id: string; total: number };
  paid: boolean;
  /** The last user message is the app reporting a rejected surface. */
  repairRequested: boolean;
  userText: string;
  said: Partial<BookingRequest>;
  needs: { fields: string[]; prefill: SpecialRequests };
  actions: Array<{ name: string; context: Record<string, unknown> }>;
}

/** The middleware's wording for a UI action (see formatUserActionResult). */
const ACTION = /^User performed action "([^"]+)" on surface .*?\. Context: (\{.*\})$/s;

function read(prompt: PromptMessage[]): Conversation {
  const actions: Conversation['actions'] = [];
  const userTexts: string[] = [];
  let last: Last = { kind: 'user' };
  let repairRequested = false;
  let booking: Conversation['booking'];
  let paid = false;
  let lastUserText = '';

  for (const message of prompt) {
    if (message.role === 'user') {
      const text = parts(message).filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n');
      last = { kind: 'user' };
      repairRequested = /REJECTED by the renderer/.test(text);
      if (!repairRequested) {
        userTexts.push(text);
        lastUserText = text;
      }
    }
    if (message.role !== 'tool') continue;
    for (const part of parts(message)) {
      if (part.type !== 'tool-result' || !part.toolName) continue;
      const value = parseJson(part.output?.value);
      if (part.toolName === RENDER_A2UI_TOOL_NAME) continue; // { status: "rendered" } — nothing to react to
      if (part.toolName === LOG_A2UI_EVENT_TOOL_NAME) {
        const match = ACTION.exec(String(value));
        if (!match) continue;
        const action = { name: match[1], context: JSON.parse(match[2]) as Record<string, unknown> };
        actions.push(action);
        last = { kind: 'action', action };
        continue;
      }
      const output = value as { id?: string; total?: number; status?: string } | undefined;
      if ([PURE_TOOL_NAMES.createBooking, PURE_TOOL_NAMES.updateBooking].includes(part.toolName as never) && output?.id) booking = { id: output.id, total: output.total ?? 0 };
      if (part.toolName === PURE_TOOL_NAMES.createPayment && output?.status === 'paid') paid = true;
      last = { kind: 'tool', name: part.toolName, output: value };
    }
  }
  const userText = userTexts.join('\n');
  return { last, lastUserText, repairRequested, booking, paid, userText, said: parseRequest(userText), needs: specialNeeds(userText), actions };
}

/**
 * Everything collected so far, translated from the forms' own shape (string
 * numbers, single-choice arrays, split dates) into the API's createBooking
 * shape — the work a real LLM has to get right on every turn.
 */
function collected(conversation: Conversation): Partial<BookingRequest> {
  const booking: Partial<BookingRequest> = { ...conversation.said, car: conversation.said.car ?? 'none' };
  for (const action of conversation.actions) {
    const context = action.context as {
      booking?: { arrival?: string; departure?: string; guests?: string; rooms?: string; board?: string[]; car?: string[] };
      specialRequests?: SpecialRequests;
    };
    if (context.booking && action.name === 'booking_details') {
      const form = context.booking;
      booking.dates = { start: form.arrival ?? '', end: form.departure ?? '' };
      booking.guests = Number(form.guests);
      booking.rooms = Number(form.rooms);
      booking.board = (form.board?.[0] ?? 'none') as BookingRequest['board'];
      booking.car = (form.car?.[0] ?? 'none') as BookingRequest['car'];
    }
    if (context.specialRequests && action.name === 'special_requests') {
      booking.specialRequests = Object.fromEntries(
        Object.entries(context.specialRequests).filter(([, value]) => value !== '' && value !== false),
      ) as SpecialRequests;
    }
  }
  return booking;
}

/** What the guest typed — deliberately naive regexes, English and Spanish. */
function parseRequest(text: string): Partial<BookingRequest> {
  const found: Partial<BookingRequest> = {};
  const guests = /(\d+)\s*(people|persons|guests|adults|personas|adultos)/i.exec(text);
  if (guests) found.guests = Number(guests[1]);
  if (/half[- ]board|media pensi/i.test(text)) found.board = 'half';
  else if (/full[- ]board|pensi[oó]n completa/i.test(text)) found.board = 'full';
  return found;
}

function suggestedDates(text: string): BookingRequest['dates'] | undefined {
  if (!/next week|semana que viene|pr[oó]xima semana/i.test(text)) return undefined;
  const start = addDays(today(), 7);
  return { start, end: addDays(start, 7) };
}

function specialNeeds(text: string): { fields: string[]; prefill: SpecialRequests } {
  const fields: string[] = [];
  const prefill: SpecialRequests = {};
  if (/baby|crib|beb[eé]|cuna/i.test(text)) {
    fields.push('babyCrib');
    prefill.babyCrib = true;
  }
  if (/wheelchair|accessib|silla de ruedas/i.test(text)) {
    fields.push('accessibleRoom');
    prefill.accessibleRoom = true;
  }
  if (/parking|aparca/i.test(text)) {
    fields.push('parking', 'licensePlate');
    prefill.parking = true;
  }
  return { fields, prefill };
}

/** The rental car the guest asks for in a change ("before paying, I want to rent a car"). */
function requestedCar(text: string): string | undefined {
  if (!/\bcar\b|coche|\bsuv\b|sports? car|compact|rental/i.test(text)) return undefined;
  return /suv/i.test(text) ? 'suv' : /sport/i.test(text) ? 'sport' : 'compact';
}

function brandOf(digits: string): string {
  if (/^4/.test(digits)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  return 'card';
}

function parts(message: PromptMessage): Part[] {
  return Array.isArray(message.content) ? (message.content as Part[]) : [{ type: 'text', text: String(message.content ?? '') }];
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
