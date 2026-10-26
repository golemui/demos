import type { GenkitBeta } from 'genkit/beta';
import type { MessageData, Part } from 'genkit';
import {
  addDays,
  BASIC_CATALOG_ID,
  BOOKING_REVIEW,
  CHECKOUT,
  CONTRACT_FORM,
  HOTEL_CATALOG_ID,
  HOTEL_EVENTS,
  today,
} from '@hotel/shared';
import type { BookingRequest, SpecialRequests } from '@hotel/shared';

/**
 * MOCK_AGENT=1 — two scripted models, for running the demo without an API key
 * (or offline).
 *
 * Only the MODEL is fake. It writes A2UI exactly like an LLM does — fenced
 * ```a2ui blocks in its text — so the real `a2ui()` middleware parses and
 * validates them, the real agent runs the tool loop, and the browser renders
 * what comes out. It reads the conversation (UI actions arrive as text like
 * `[UI action "name" on surface … context={…}]`) to pick its next move.
 */

type Turn = { text: string; a2ui?: unknown[]; tool?: { name: string; input: unknown } };

export function defineMockModels(ai: GenkitBeta) {
  const define = (name: string, script: (messages: MessageData[]) => Turn) =>
    ai.defineModel(
      { apiVersion: 'v2', name, supports: { multiturn: true, tools: true, systemRole: true, output: ['text'] } },
      async (request, { sendChunk, streamingRequested }) => {
        const turn = script(request.messages);
        const block = turn.a2ui ? `\n\n\`\`\`a2ui\n${JSON.stringify(turn.a2ui, null, 1)}\n\`\`\`` : '';
        const text = turn.text + block;
        if (streamingRequested) {
          // Prose word by word; the A2UI block in big slices (the middleware
          // reassembles fenced blocks split across chunks).
          const pieces = [...turn.text.split(/(?<=\s)/), ...(block.match(/[\s\S]{1,600}/g) ?? [])];
          for (const piece of pieces) {
            sendChunk({ role: 'model', content: [{ text: piece }] });
            await new Promise((resolve) => setTimeout(resolve, 15));
          }
        }
        const content: Part[] = [{ text }];
        if (turn.tool) content.push({ toolRequest: { name: turn.tool.name, ref: `mock-${Date.now()}`, input: turn.tool.input } });
        return { message: { role: 'model', content }, finishReason: 'stop' };
      },
    );

  return { pure: define('mock/pure-concierge', pureScript), golem: define('mock/golem-concierge', golemScript) };
}

// ---------------------------------------------------------------------------
// A2UI + GolemUI: the agent only picks the operation + fields
// ---------------------------------------------------------------------------

function golemScript(messages: MessageData[]): Turn {
  const read = readConversation(messages);
  const { last, said, needs } = read;

  if (last.kind === 'user') {
    if (read.paid) return { text: 'Anything else? Your booking is all set.' };
    // A booking exists but isn't paid: the guest is asking for a change.
    if (read.booking) {
      const change = requestedChanges(read.lastUserText);
      if (change.fields.length === 0) return { text: 'Sure — what would you like to change? The dates, guests, board or a rental car?' };
      return {
        text: "Of course — let's update your booking.",
        a2ui: surface(HOTEL_CATALOG_ID, [
          { id: 'root', component: 'Column', children: ['title', 'form'] },
          { id: 'title', component: 'Text', text: `Change booking ${read.booking.id}`, variant: 'h3' },
          {
            id: 'form',
            component: CONTRACT_FORM,
            operation: 'updateBooking',
            fields: change.fields,
            prefill: change.prefill,
            submitLabel: 'Review the change',
            action: { event: { name: 'booking_changes' } },
          },
        ]),
      };
    }
    const missing = missingCore(said);
    return {
      text: "Happy to help! Just a few details and you're set.",
      a2ui: surface(HOTEL_CATALOG_ID, [
        { id: 'root', component: 'Column', children: ['title', 'form'] },
        { id: 'title', component: 'Text', text: said.guests ? `A stay for ${said.guests}` : 'Your stay', variant: 'h3' },
        {
          id: 'form',
          component: CONTRACT_FORM,
          operation: 'createBooking',
          fields: missing,
          prefill: prefillFor(said, read.userText),
          submitLabel: 'Continue',
          action: { event: { name: 'booking_details' } },
        },
      ]),
    };
  }

  if (last.kind === 'action') {
    const booking = collected(read);
    switch (last.action.name) {
      case 'booking_details':
        return { text: 'Let me check availability… ', tool: { name: 'check_availability', input: { dates: booking.dates, rooms: booking.rooms } } };
      case 'special_requests':
        return review(booking);
      case 'booking_changes':
        return review(booking, read.booking?.id);
      case HOTEL_EVENTS.bookingRejected:
        return { text: 'No problem — what would you like to change?' };
      case HOTEL_EVENTS.bookingConfirmed: {
        const { booking: created, humanChanges } = last.action.context as {
          booking: { id: string; total: number };
          humanChanges: Array<{ path: string; approved: unknown }>;
        };
        const ack = humanChanges?.length ? `I've applied your changes (${humanChanges.map((c) => `${c.path} → ${fmt(c.approved)}`).join(', ')}). ` : '';
        return {
          text: `${ack}Booking ${created.id} is reserved — €${created.total.toFixed(2)}. Last step, the payment:`,
          a2ui: surface(HOTEL_CATALOG_ID, [{ id: 'root', component: CHECKOUT, bookingId: created.id, amount: created.total }]),
        };
      }
      case HOTEL_EVENTS.paymentCompleted: {
        const paid = last.action.context as { brand: string; last4: string };
        return { text: `Payment received on your ${paid.brand} ending ${paid.last4}. See you at Hotel Aurora!` };
      }
      case HOTEL_EVENTS.paymentCancelled:
        return { text: 'No problem — would you like to change anything in your booking before paying? The dates, the board, a rental car…' };
    }
  }

  if (last.kind === 'tool' && last.name === 'check_availability') {
    const availability = last.output as { available?: boolean; roomsLeft?: number };
    if (!availability.available) return { text: `Sorry — only ${availability.roomsLeft} room(s) left on those dates. Other dates?` };
    if (needs.fields.length === 0) return review(collected(read));
    return {
      text: "Good news, we have rooms. You mentioned a couple of things — let's add them to the booking.",
      a2ui: surface(HOTEL_CATALOG_ID, [
        { id: 'root', component: 'Column', children: ['title', 'form'] },
        { id: 'title', component: 'Text', text: 'A few extras', variant: 'h3' },
        {
          id: 'form',
          component: CONTRACT_FORM,
          operation: 'createBooking',
          fields: needs.fields.map((field) => `specialRequests.${field}`),
          prefill: { specialRequests: needs.prefill },
          submitLabel: 'Add to my booking',
          action: { event: { name: 'special_requests' } },
        },
      ]),
    };
  }

  return { text: 'Sorry, I lost track — what do you need?' };
}

function review(booking: Partial<BookingRequest>, bookingId?: string): Turn {
  return {
    text: bookingId
      ? `Here is booking ${bookingId} with your change — check the new price.`
      : 'Here is your booking — have a look, you can still change anything.',
    a2ui: surface(HOTEL_CATALOG_ID, [
      { id: 'root', component: BOOKING_REVIEW, proposal: booking, ...(bookingId ? { bookingId } : {}) },
    ]),
  };
}

// ---------------------------------------------------------------------------
// Pure A2UI: the agent composes every form from basic components
// ---------------------------------------------------------------------------

function pureScript(messages: MessageData[]): Turn {
  const read = readConversation(messages);
  const { last, said, needs } = read;

  if (last.kind === 'user') {
    if (read.paid) return { text: 'Anything else? Your booking is all set.' };
    if (read.booking && !read.repairRequested) {
      const change = requestedChanges(read.lastUserText);
      if (!change.fields.includes('car')) return { text: 'Sure — what would you like to change?' };
      return { text: "Of course — let's update your booking.", a2ui: pureCarChangeForm(change.prefill.car ?? 'compact') };
    }
    // The renderer reported our surface as invalid: re-render it, fixed.
    if (read.repairRequested) return { text: 'Sorry about that — here it is again.', a2ui: pureBookingForm(said, read.userText) };
    // "…slider…" reproduces a real Claude mistake: Slider.step, which @genkit-ai/a2ui's
    // catalog description advertises and web_core's strict schema rejects.
    const form = pureBookingForm(said, read.userText);
    return { text: "Happy to help! Just a few details and you're set.", a2ui: /slider/i.test(read.userText) ? withGuestSlider(form) : form };
  }

  if (last.kind === 'action') {
    const booking = collected(read);
    switch (last.action.name) {
      case 'booking_details':
        return { text: 'Let me check availability… ', tool: { name: 'check_availability', input: { dates: booking.dates, rooms: booking.rooms } } };
      case 'special_requests':
      case 'change_booking':
        return { text: 'Pricing it… ', tool: { name: 'quote_booking', input: booking } };
      case 'confirm_booking':
        return { text: 'Booking it… ', tool: { name: 'create_booking', input: booking } };
      case 'booking_changes': {
        // The form's own shape (a single-choice array) → the API's.
        const changes = (last.action.context.changes ?? {}) as { car?: string[] };
        return {
          text: 'Updating your booking… ',
          tool: { name: 'update_booking', input: { bookingId: read.booking?.id, changes: { car: changes.car?.[0] ?? 'none' } } },
        };
      }
      case 'pay': {
        const card = (last.action.context.card ?? {}) as { number?: string };
        const digits = String(card.number ?? '').replace(/\D/g, '');
        const created = read.booking as { id: string; total: number };
        return {
          text: 'Charging the card… ',
          tool: { name: 'create_payment', input: { bookingId: created.id, amount: created.total, brand: brandOf(digits), last4: digits.slice(-4) } },
        };
      }
    }
  }

  if (last.kind === 'tool') {
    switch (last.name) {
      case 'check_availability': {
        const availability = last.output as { available?: boolean; roomsLeft?: number };
        if (!availability.available) return { text: `Sorry — only ${availability.roomsLeft} room(s) left on those dates. Other dates?` };
        if (needs.fields.length === 0) return { text: 'Pricing it… ', tool: { name: 'quote_booking', input: collected(read) } };
        return { text: "Good news, we have rooms. Let's add what you mentioned.", a2ui: pureSpecialRequestsForm(needs) };
      }
      case 'quote_booking': {
        const quote = last.output as { lines?: Array<{ label: string; amount: number }>; total?: number; problems?: string[] };
        if (quote.problems) return { text: `That booking breaks a rule: ${quote.problems.join(' ')} Shall we change it?` };
        return { text: 'Here is your booking:', a2ui: pureReviewCard(quote) };
      }
      case 'create_booking': {
        const created = last.output as { id?: string; total?: number; problems?: string[] };
        if (created.problems) return { text: `The hotel refused it: ${created.problems.join(' ')}` };
        return { text: `Booking ${created.id} is reserved. Last step, the payment:`, a2ui: purePaymentForm(created.total ?? 0) };
      }
      case 'update_booking': {
        const updated = last.output as { id?: string; total?: number; problems?: string[] };
        if (updated.problems) return { text: `The hotel couldn't change it: ${updated.problems.join(' ')}` };
        return { text: `Done — booking ${updated.id} now comes to €${(updated.total ?? 0).toFixed(2)}.`, a2ui: purePaymentForm(updated.total ?? 0) };
      }
      case 'create_payment': {
        const paid = last.output as { payment?: { brand: string; last4: string }; problems?: string[] };
        if (paid.problems) return { text: `The payment failed: ${paid.problems.join(' ')}` };
        return { text: `Payment received on your ${paid.payment?.brand} ending ${paid.payment?.last4}. See you at Hotel Aurora!` };
      }
    }
  }

  return { text: 'Sorry, I lost track — what do you need?' };
}

const required = (path: string) => ({ call: 'required', args: { value: { path } } });

function pureBookingForm(said: Partial<BookingRequest>, userText: string): unknown[] {
  const dates = suggestedDates(userText);
  const options = (pairs: string[][]) => pairs.map(([value, label]) => ({ value, label }));
  return surface(
    BASIC_CATALOG_ID,
    [
      { id: 'root', component: 'Card', child: 'form' },
      { id: 'form', component: 'Column', children: ['title', 'dates', 'counts', 'board_label', 'board', 'car_label', 'car', 'submit'] },
      { id: 'title', component: 'Text', text: 'Your stay', variant: 'h3' },
      { id: 'dates', component: 'Row', children: ['arrival', 'departure'] },
      { id: 'arrival', component: 'DateTimeInput', label: 'Arrival', value: { path: '/booking/arrival' }, min: today(), weight: 1 },
      { id: 'departure', component: 'DateTimeInput', label: 'Departure', value: { path: '/booking/departure' }, min: today(), weight: 1 },
      { id: 'counts', component: 'Row', children: ['guests', 'rooms'] },
      {
        id: 'guests',
        component: 'TextField',
        label: 'Guests',
        variant: 'number',
        value: { path: '/booking/guests' },
        weight: 1,
        // Not `numeric`: TextField stores strings and web_core 0.14's numeric() rejects them.
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
      // The Angular renderer ignores ChoicePicker's `label`, so a caption goes first.
      { id: 'board_label', component: 'Text', text: 'Board', variant: 'caption' },
      { id: 'car_label', component: 'Text', text: 'Rental car', variant: 'caption' },
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
            condition: { call: 'and', args: { values: ['arrival', 'departure', 'guests', 'rooms'].map((f) => required(`/booking/${f}`)) } },
            message: 'Fill in the dates, guests and rooms',
          },
        ],
        action: { event: { name: 'booking_details', context: { booking: { path: '/booking' } } } },
      },
    ],
    {
      booking: {
        arrival: dates?.start ?? '',
        departure: dates?.end ?? '',
        guests: said.guests ? String(said.guests) : '',
        rooms: said.guests ? String(Math.ceil(said.guests / 4)) : '',
        board: [said.board ?? 'none'],
        car: ['none'],
      },
    },
  );
}

/** The booking form with a guests Slider carrying `step` — invalid for web_core. */
function withGuestSlider(envelopes: unknown[]): unknown[] {
  const update = envelopes[1] as { updateComponents: { components: Array<Record<string, unknown>> } };
  update.updateComponents.components = update.updateComponents.components.map((c) =>
    c['id'] === 'guests' ? { id: 'guests', component: 'Slider', label: 'Guests', min: 1, max: 12, step: 1, value: { path: '/booking/guestsCount' } } : c,
  );
  return envelopes;
}

function pureSpecialRequestsForm(needs: { fields: string[]; prefill: SpecialRequests }): unknown[] {
  const labels: Record<string, string> = {
    babyCrib: 'Baby crib in the room',
    accessibleRoom: 'Step-free, accessible room',
    parking: 'Reserve a parking space',
    licensePlate: 'License plate',
    arrivalTime: 'Expected arrival time',
    dietary: 'Dietary needs',
  };
  const inputs = needs.fields.map((field) =>
    field === 'licensePlate' || field === 'arrivalTime' || field === 'dietary'
      ? { id: field, component: 'TextField', label: labels[field], value: { path: `/requests/${field}` } }
      : { id: field, component: 'CheckBox', label: labels[field], value: { path: `/requests/${field}` } },
  );
  return surface(
    BASIC_CATALOG_ID,
    [
      { id: 'root', component: 'Card', child: 'form' },
      { id: 'form', component: 'Column', children: ['title', ...needs.fields, 'submit'] },
      { id: 'title', component: 'Text', text: 'Special requests', variant: 'h3' },
      ...inputs,
      { id: 'submit_label', component: 'Text', text: 'Add to my booking' },
      {
        id: 'submit',
        component: 'Button',
        child: 'submit_label',
        variant: 'primary',
        action: { event: { name: 'special_requests', context: { specialRequests: { path: '/requests' } } } },
      },
    ],
    { requests: { ...Object.fromEntries(needs.fields.map((f) => [f, f === 'licensePlate' ? '' : false])), ...needs.prefill } },
  );
}

function pureReviewCard(quote: { lines?: Array<{ label: string; amount: number }>; total?: number }): unknown[] {
  const lines = (quote.lines ?? []).map((line, index) => ({
    id: `line${index}`,
    component: 'Text',
    text: `${line.label} — €${line.amount.toFixed(2)}`,
  }));
  return surface(BASIC_CATALOG_ID, [
    { id: 'root', component: 'Card', child: 'body' },
    { id: 'body', component: 'Column', children: ['title', ...lines.map((l) => l.id), 'divider', 'total', 'actions'] },
    { id: 'title', component: 'Text', text: 'Review your booking', variant: 'h3' },
    ...lines,
    { id: 'divider', component: 'Divider' },
    { id: 'total', component: 'Text', text: `**Total: €${(quote.total ?? 0).toFixed(2)}**` },
    { id: 'actions', component: 'Row', children: ['change', 'confirm'], justify: 'end' },
    { id: 'change_label', component: 'Text', text: 'Change something' },
    { id: 'change', component: 'Button', child: 'change_label', variant: 'borderless', action: { event: { name: 'change_booking' } } },
    { id: 'confirm_label', component: 'Text', text: 'Confirm booking' },
    { id: 'confirm', component: 'Button', child: 'confirm_label', variant: 'primary', action: { event: { name: 'confirm_booking' } } },
  ]);
}

function pureCarChangeForm(suggested: string): unknown[] {
  return surface(
    BASIC_CATALOG_ID,
    [
      { id: 'root', component: 'Card', child: 'form' },
      { id: 'form', component: 'Column', children: ['title', 'car_label', 'car', 'submit'] },
      { id: 'title', component: 'Text', text: 'Add a rental car', variant: 'h3' },
      { id: 'car_label', component: 'Text', text: 'Rental car', variant: 'caption' },
      {
        id: 'car',
        component: 'ChoicePicker',
        variant: 'mutuallyExclusive',
        value: { path: '/changes/car' },
        options: [
          { value: 'none', label: 'No car' },
          { value: 'compact', label: 'Compact' },
          { value: 'suv', label: 'SUV' },
          { value: 'sport', label: 'Sports car' },
        ],
      },
      { id: 'submit_label', component: 'Text', text: 'Update booking' },
      { id: 'submit', component: 'Button', child: 'submit_label', variant: 'primary', action: { event: { name: 'booking_changes', context: { changes: { path: '/changes' } } } } },
    ],
    { changes: { car: [suggested] } },
  );
}

function purePaymentForm(total: number): unknown[] {
  return surface(
    BASIC_CATALOG_ID,
    [
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
    { card: { holder: '', number: '', expiry: '', cvc: '' } },
  );
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
  /** The guest's latest chat message (not UI actions). */
  lastUserText: string;
  /** The latest booking the hotel returned (created or updated), until it's paid. */
  booking?: { id: string; total: number };
  paid: boolean;
  /** The last user message is the app reporting a rejected surface. */
  repairRequested: boolean;
  userText: string;
  said: Partial<BookingRequest>;
  needs: { fields: string[]; prefill: SpecialRequests };
  actions: Array<{ name: string; context: Record<string, unknown> }>;
  toolOutputs: Record<string, unknown>;
}

const ACTION = /\[UI action "([^"]+)" on surface \S+?(?: context=(\{.*\}))?\]/s;

function readConversation(messages: MessageData[]): Conversation {
  const actions: Conversation['actions'] = [];
  const toolOutputs: Record<string, unknown> = {};
  const userTexts: string[] = [];
  let last: Last = { kind: 'user' };
  let repairRequested = false;
  let lastUserText = '';
  let booking: Conversation['booking'];
  let paid = false;

  for (const message of messages) {
    if (message.role === 'user') {
      const text = message.content.map((part) => part.text ?? '').join('\n');
      const match = ACTION.exec(text);
      if (match) {
        const action = { name: match[1], context: match[2] ? (JSON.parse(match[2]) as Record<string, unknown>) : {} };
        actions.push(action);
        last = { kind: 'action', action };
        const confirmed = (action.context as { booking?: { id: string; total: number } }).booking;
        if (action.name === HOTEL_EVENTS.bookingConfirmed && confirmed) booking = confirmed;
        if (action.name === HOTEL_EVENTS.paymentCompleted) paid = true;
      } else if (/REJECTED by the renderer/.test(text)) {
        last = { kind: 'user' };
        repairRequested = true;
      } else {
        userTexts.push(text);
        lastUserText = text;
        last = { kind: 'user' };
        repairRequested = false;
      }
    }
    if (message.role === 'tool') {
      for (const part of message.content) {
        if (part.toolResponse) {
          toolOutputs[part.toolResponse.name] = part.toolResponse.output;
          const output = part.toolResponse.output as { id?: string; total?: number; status?: string } | undefined;
          if (['create_booking', 'update_booking'].includes(part.toolResponse.name) && output?.id) {
            booking = { id: output.id, total: output.total ?? 0 };
          }
          if (part.toolResponse.name === 'create_payment' && output?.status === 'paid') paid = true;
          last = { kind: 'tool', name: part.toolResponse.name, output: part.toolResponse.output };
        }
      }
    }
  }
  const userText = userTexts.join('\n');
  return {
    last,
    repairRequested,
    lastUserText,
    booking,
    paid,
    userText,
    said: parseRequest(userText),
    needs: specialNeeds(userText),
    actions,
    toolOutputs,
  };
}

/**
 * Everything collected so far, in the API's createBooking shape. Golem actions
 * already carry API-shaped `values`; pure-A2UI actions carry whatever the
 * agent's own form looked like (string numbers, single-choice arrays, split
 * dates) and must be translated — by the LLM, in real life.
 */
function collected(read: Conversation): Partial<BookingRequest> {
  const booking: Partial<BookingRequest> = { ...read.said, car: read.said.car ?? 'none' };
  for (const action of read.actions) {
    const { values, booking: pure, specialRequests } = action.context as {
      values?: Partial<BookingRequest>;
      booking?: { arrival?: string; departure?: string; guests?: string; rooms?: string; board?: string[]; car?: string[] };
      specialRequests?: SpecialRequests;
    };
    if (values) {
      const { specialRequests: requests, ...rest } = values;
      Object.assign(booking, rest);
      if (requests) booking.specialRequests = { ...booking.specialRequests, ...requests };
    }
    if (pure && action.name === 'booking_details') {
      booking.dates = { start: pure.arrival ?? '', end: pure.departure ?? '' };
      booking.guests = Number(pure.guests);
      booking.rooms = Number(pure.rooms);
      booking.board = (pure.board?.[0] ?? 'none') as BookingRequest['board'];
      booking.car = (pure.car?.[0] ?? 'none') as BookingRequest['car'];
    }
    const humanChanges = (action.context as { humanChanges?: Array<{ path: string; approved: unknown }> }).humanChanges;
    for (const change of humanChanges ?? []) setPath(booking as Record<string, unknown>, change.path, change.approved);
    if (specialRequests && action.name === 'special_requests') {
      booking.specialRequests = Object.fromEntries(
        Object.entries(specialRequests).filter(([, value]) => value !== '' && value !== false),
      ) as SpecialRequests;
    }
  }
  return booking;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) node = (node[key] ??= {}) as Record<string, unknown>;
  node[keys[keys.length - 1]] = value;
}

/** Which booking fields the guest asks to change, from their message. */
function requestedChanges(text: string): { fields: string[]; prefill: Partial<BookingRequest> } {
  const fields: string[] = [];
  const prefill: Partial<BookingRequest> = {};
  if (/\bcar\b|coche|\bsuv\b|sports? car|compact|rental/i.test(text)) {
    fields.push('car');
    prefill.car = /suv/i.test(text) ? 'suv' : /sport/i.test(text) ? 'sport' : 'compact';
  }
  if (/board|pensi[oó]n|breakfast|meal/i.test(text)) fields.push('board');
  if (/date|night|fecha|noche/i.test(text)) fields.push('dates');
  if (/guest|people|persona|room|habitaci/i.test(text)) fields.push('guests', 'rooms');
  return { fields, prefill };
}

const CORE = ['dates', 'guests', 'rooms', 'board', 'car'] as const;

function missingCore(known: Partial<BookingRequest>): string[] {
  return CORE.filter((field) => known[field] === undefined);
}

function prefillFor(said: Partial<BookingRequest>, userText: string): Partial<BookingRequest> {
  const prefill: Partial<BookingRequest> = { car: 'none' };
  const dates = suggestedDates(userText);
  if (dates) prefill.dates = dates;
  if (said.guests) prefill.rooms = Math.max(1, Math.ceil(said.guests / 4));
  return prefill;
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

function brandOf(digits: string): string {
  if (/^4/.test(digits)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  return 'card';
}

function fmt(value: unknown): string {
  return value && typeof value === 'object' ? Object.values(value).join(' → ') : String(value);
}

/** A whole surface, the way the a2ui() instructions ask the model to write it. */
function surface(catalogId: string, components: unknown[], data?: Record<string, unknown>): unknown[] {
  const envelopes: unknown[] = [
    { createSurface: { surfaceId: 'SURFACE_ID', catalogId, sendDataModel: true } },
    { updateComponents: { surfaceId: 'SURFACE_ID', components } },
  ];
  if (data) envelopes.push({ updateDataModel: { surfaceId: 'SURFACE_ID', path: '/', value: data } });
  return envelopes;
}
