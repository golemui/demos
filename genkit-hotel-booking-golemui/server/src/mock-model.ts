import type { GenkitBeta } from 'genkit/beta';
import type { MessageData, Part } from 'genkit';
import {
  addDays,
  BOOKING_REVIEW,
  CHECKOUT,
  CONTRACT_FORM,
  HOTEL_CATALOG_ID,
  HOTEL_EVENTS,
  today,
} from '@hotel/shared';
import type { BookingRequest, SpecialRequests } from '@hotel/shared';

/**
 * MOCK_AGENT=1 — a scripted model, for running the demo without an API key
 * (or offline).
 *
 * Only the MODEL is fake. It writes A2UI exactly like an LLM does — fenced
 * ```a2ui blocks in its text — so the real `a2ui()` middleware parses and
 * validates them, the real agent runs the tool loop, and the browser renders
 * what comes out. It reads the conversation (UI actions arrive as text like
 * `[UI action "name" on surface … context={…}]`) to pick its next move.
 */

type Turn = { text: string; a2ui?: unknown[]; tool?: { name: string; input: unknown } };

export function defineMockModel(ai: GenkitBeta) {
  return ai.defineModel(
      { apiVersion: 'v2', name: 'mock/concierge', supports: { multiturn: true, tools: true, systemRole: true, output: ['text'] } },
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
}

// ---------------------------------------------------------------------------
// The script: the agent only picks the operation + fields
// ---------------------------------------------------------------------------

function script(messages: MessageData[]): Turn {
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
  /** The latest booking the app created or updated (from booking_confirmed). */
  booking?: { id: string; total: number };
  paid: boolean;
  userText: string;
  said: Partial<BookingRequest>;
  needs: { fields: string[]; prefill: SpecialRequests };
  actions: Array<{ name: string; context: Record<string, unknown> }>;
}

const ACTION = /\[UI action "([^"]+)" on surface \S+?(?: context=(\{.*\}))?\]/s;

function readConversation(messages: MessageData[]): Conversation {
  const actions: Conversation['actions'] = [];
  const userTexts: string[] = [];
  let last: Last = { kind: 'user' };
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
      } else {
        userTexts.push(text);
        lastUserText = text;
        last = { kind: 'user' };
      }
    }
    if (message.role === 'tool') {
      for (const part of message.content) {
        if (part.toolResponse) last = { kind: 'tool', name: part.toolResponse.name, output: part.toolResponse.output };
      }
    }
  }
  const userText = userTexts.join('\n');
  return { last, lastUserText, booking, paid, userText, said: parseRequest(userText), needs: specialNeeds(userText), actions };
}

/**
 * Everything collected so far, in the API's createBooking shape. The
 * ContractForm actions already carry API-shaped `values`: nothing to translate.
 */
function collected(read: Conversation): Partial<BookingRequest> {
  const booking: Partial<BookingRequest> = { ...read.said, car: read.said.car ?? 'none' };
  for (const action of read.actions) {
    const { values } = action.context as { values?: Partial<BookingRequest> };
    if (values) {
      const { specialRequests: requests, ...rest } = values;
      Object.assign(booking, rest);
      if (requests) booking.specialRequests = { ...booking.specialRequests, ...requests };
    }
    const humanChanges = (action.context as { humanChanges?: Array<{ path: string; approved: unknown }> }).humanChanges;
    for (const change of humanChanges ?? []) setPath(booking as Record<string, unknown>, change.path, change.approved);
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
