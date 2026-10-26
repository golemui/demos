import { MockLanguageModelV4 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import {
  CHECK_AVAILABILITY_TOOL_NAME,
  addDays,
  ASK_USER_TOOL,
  COLLECT_PAYMENT_TOOL,
  CONFIRM_BOOKING_TOOL,
  today,
} from '@hotel/shared';
import type { BookingRequest, SpecialRequests } from '@hotel/shared';

/**
 * MOCK_AGENT=1 — a scripted language model, for running the demo without an
 * API key (or offline) and for the E2E test.
 *
 * Only the MODEL is fake: it plugs into the real Mastra agent, so tool
 * execution, the AG-UI bridge and the browser all run the production path. It
 * reads the conversation like an agent would and picks the next tool call —
 * including the "only ask what's missing" behaviour: "Book a room for 2 people
 * next week, half board" yields a form with just rooms and car.
 */

type PromptMessage = { role: string; content: unknown };
type Part = { type: string; text?: string; toolName?: string; toolCallId?: string; output?: { type: string; value: unknown } };

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

let callCounter = 0;

export function createMockModel() {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'scripted-concierge',
    doStream: async (options) => {
      const turn = nextTurn(options.prompt as unknown as PromptMessage[]);
      const id = `mock-text-${++callCounter}`;
      const chunks: unknown[] = [{ type: 'stream-start', warnings: [] }];
      chunks.push({ type: 'text-start', id });
      // Stream word by word so the UI shows real streaming.
      for (const word of turn.text.split(/(?<= )/)) chunks.push({ type: 'text-delta', id, delta: word });
      chunks.push({ type: 'text-end', id });
      if (turn.tool) {
        chunks.push({
          type: 'tool-call',
          toolCallId: `mock-call-${callCounter}`,
          toolName: turn.tool.name,
          input: JSON.stringify(turn.tool.args),
        });
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

interface Turn {
  text: string;
  tool?: { name: string; args: Record<string, unknown> };
}

function nextTurn(prompt: PromptMessage[]): Turn {
  const last = prompt[prompt.length - 1];
  const userText = prompt
    .filter((message) => message.role === 'user')
    .flatMap((message) => parts(message).filter((part) => part.type === 'text').map((part) => part.text ?? ''))
    .join('\n');
  const said = parseRequest(userText);
  const results = toolResults(prompt);
  const booked = bookedState(results);

  if (last.role !== 'tool') {
    // A (new) user message. Once the flow is done, just chat.
    if (results.some((result) => result.name === COLLECT_PAYMENT_TOOL.name && (result.value as { status?: string }).status === 'paid')) {
      return { text: 'Anything else I can help you with? Your booking is all set.' };
    }
    // A booking exists but isn't paid: the guest is asking for a change.
    if (booked) {
      const change = requestedChanges(lastUserText(prompt));
      if (change.fields.length === 0) return { text: 'Sure — what would you like to change? The dates, guests, board or a rental car?' };
      return {
        text: "Of course — let's update your booking.",
        tool: {
          name: ASK_USER_TOOL.name,
          args: { operation: 'updateBooking', fields: change.fields, prefill: change.prefill, intro: `Change booking ${booked.id}`, submitLabel: 'Review the change' },
        },
      };
    }
    return askForBooking(said, suggestedDates(userText));
  }

  const latest = results[results.length - 1];
  switch (latest.name) {
    case ASK_USER_TOOL.name: {
      if ((latest.args as { operation?: string }).operation === 'updateBooking' && booked) {
        // The changed fields over the booking as it stands → review, which PATCHes the same booking.
        const { specialRequests, ...rest } = latest.value as Partial<BookingRequest>;
        const proposal = { ...booked.request, ...rest, ...(specialRequests ? { specialRequests: { ...booked.request.specialRequests, ...specialRequests } } : {}) };
        return {
          text: `Here is booking ${booked.id} with your change — check the new price.`,
          tool: { name: CONFIRM_BOOKING_TOOL.name, args: { ...proposal, bookingId: booked.id } as unknown as Record<string, unknown> },
        };
      }
      const collected = collectedBooking(said, results);
      if (missingFields(collected).length > 0) return askForBooking(collected, suggestedDates(userText));
      // Special requests answered → everything is known: propose the booking.
      if (askedSpecialRequests(results)) return propose(collected);
      return {
        text: 'Let me check availability for those dates… ',
        tool: { name: CHECK_AVAILABILITY_TOOL_NAME, args: { dates: collected.dates, rooms: collected.rooms } },
      };
    }

    case CHECK_AVAILABILITY_TOOL_NAME: {
      // A SERVER tool: Mastra ran it and called the model again in the same run.
      const availability = latest.value as { available?: boolean; roomsLeft?: number };
      if (!availability.available) {
        return { text: `Sorry — only ${availability.roomsLeft ?? 0} room(s) left for those dates. Would other dates work?` };
      }
      const needs = specialNeeds(userText);
      const collected = collectedBooking(said, results);
      if (needs.fields.length === 0) return propose(collected);
      return {
        text: `Good news, we have rooms. You mentioned a few things — let's add them to your booking.`,
        tool: {
          name: ASK_USER_TOOL.name,
          args: {
            operation: 'createBooking',
            fields: needs.fields.map((field) => `specialRequests.${field}`),
            prefill: { specialRequests: needs.prefill },
            intro: 'We’ll have these ready when you arrive',
            submitLabel: 'Add to my booking',
          },
        },
      };
    }

    case CONFIRM_BOOKING_TOOL.name: {
      const value = latest.value as {
        status: string;
        booking?: { id: string; total: number };
        humanChanges?: Array<{ path: string; proposed: unknown; approved: unknown }>;
        problems?: string[];
      };
      if (value.status === 'rejected') return { text: 'No problem — what would you like to change?' };
      if (value.status !== 'booked' || !value.booking) {
        return { text: `The hotel couldn't take that booking: ${(value.problems ?? []).join(' ')} What should we change?` };
      }
      const changes = (value.humanChanges ?? []).map((change) => `${change.path} → ${format(change.approved)}`);
      const ack = changes.length > 0 ? `I've applied your changes (${changes.join(', ')}). ` : '';
      const updated = Boolean((latest.args as { bookingId?: string }).bookingId);
      return {
        text: updated
          ? `${ack}Booking ${value.booking.id} is updated — €${value.booking.total.toFixed(2)} in total now. Here is the payment again:`
          : `${ack}Booking ${value.booking.id} is reserved — €${value.booking.total.toFixed(2)} in total. Last step, the payment:`,
        tool: { name: COLLECT_PAYMENT_TOOL.name, args: { bookingId: value.booking.id, amount: value.booking.total } },
      };
    }

    case COLLECT_PAYMENT_TOOL.name: {
      const value = latest.value as { status: string; brand?: string; last4?: string };
      if (value.status !== 'paid') {
        return { text: 'No problem — would you like to change anything in your booking before paying? The dates, guests, board or a rental car?' };
      }
      const requests = askedSpecialRequests(results) ? ' Your special requests are saved with the booking.' : '';
      return { text: `Payment received on your ${value.brand} ending ${value.last4}.${requests} See you at Hotel Aurora!` };
    }

    default:
      return { text: 'Sorry, I lost track there — could you tell me what you need?' };
  }
}

function propose(booking: Partial<BookingRequest>): Turn {
  return {
    text: 'Here is your booking — have a look, you can still change anything before confirming.',
    tool: { name: CONFIRM_BOOKING_TOOL.name, args: booking as unknown as Record<string, unknown> },
  };
}

function askForBooking(known: Partial<BookingRequest>, dates?: BookingRequest['dates']): Turn {
  const missing = missingFields(known);
  const prefill: Partial<BookingRequest> = {};
  if (!known.dates && dates) prefill.dates = dates;
  if (!known.rooms && known.guests) prefill.rooms = Math.max(1, Math.ceil(known.guests / 4));
  if (!known.car) prefill.car = 'none';
  return {
    text: 'Happy to help! I just need a few details.',
    tool: {
      name: ASK_USER_TOOL.name,
      args: {
        operation: 'createBooking',
        fields: missing,
        prefill,
        intro: known.guests ? `A stay for ${known.guests} — a few more details:` : 'Tell me about your stay',
        submitLabel: 'Continue',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Reading the conversation
// ---------------------------------------------------------------------------

const BOOKING_FIELDS = ['dates', 'guests', 'rooms', 'board', 'car'] as const;

/** What the guest typed — deliberately naive regexes, English and Spanish. */
function parseRequest(text: string): Partial<BookingRequest> {
  const found: Partial<BookingRequest> = {};
  const guests = /(\d+)\s*(people|persons|guests|adults|personas|adultos)/i.exec(text);
  if (guests) found.guests = Number(guests[1]);
  const rooms = /(\d+)\s*(rooms?|habitaci)/i.exec(text);
  if (rooms) found.rooms = Number(rooms[1]);
  if (/half[- ]board|media pensi/i.test(text)) found.board = 'half';
  else if (/full[- ]board|pensi[oó]n completa/i.test(text)) found.board = 'full';
  return found;
}

/** "Next week" is vague: it becomes a SUGGESTION (prefill) the guest confirms, not a known value. */
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
  if (/wheelchair|accessib|silla de ruedas|movilidad/i.test(text)) {
    fields.push('accessibleRoom');
    prefill.accessibleRoom = true;
  }
  if (/parking|aparca/i.test(text)) {
    fields.push('parking', 'licensePlate');
    prefill.parking = true;
  }
  if (/late|tarde|noche/i.test(text)) fields.push('arrivalTime');
  if (/vegan|vegetarian|gluten|celiac|cel[ií]ac/i.test(text)) fields.push('dietary');
  return { fields, prefill };
}

function missingFields(known: Partial<BookingRequest>): string[] {
  return BOOKING_FIELDS.filter((field) => known[field] === undefined);
}

/** Everything the guest said or submitted so far, in the createBooking shape. */
function collectedBooking(said: Partial<BookingRequest>, results: ToolResult[]): Partial<BookingRequest> {
  const collected: Partial<BookingRequest> = { ...said };
  for (const result of results) {
    if (result.name !== ASK_USER_TOOL.name) continue;
    const { specialRequests, ...rest } = result.value as Partial<BookingRequest>;
    Object.assign(collected, rest);
    if (specialRequests) collected.specialRequests = { ...collected.specialRequests, ...specialRequests };
  }
  return collected;
}

/**
 * The latest booking the app created or updated (confirm_booking → booked):
 * the proposal with the guest's own edits in the review applied.
 */
function bookedState(results: ToolResult[]): { id: string; request: BookingRequest } | undefined {
  const confirmed = results.filter((result) => result.name === CONFIRM_BOOKING_TOOL.name && (result.value as { status?: string }).status === 'booked').at(-1);
  if (!confirmed) return undefined;
  const { bookingId: _id, ...proposal } = confirmed.args as BookingRequest & { bookingId?: string };
  const value = confirmed.value as { booking: { id: string }; humanChanges?: Array<{ path: string; approved: unknown }> };
  const request = structuredClone(proposal) as BookingRequest;
  for (const change of value.humanChanges ?? []) setPath(request as unknown as Record<string, unknown>, change.path, change.approved);
  return { id: value.booking.id, request };
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

function lastUserText(prompt: PromptMessage[]): string {
  const user = prompt.filter((message) => message.role === 'user').at(-1);
  return user ? parts(user).filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n') : '';
}

function askedSpecialRequests(results: ToolResult[]): boolean {
  return results.some(
    (result) =>
      result.name === ASK_USER_TOOL.name &&
      ((result.args as { fields?: string[] }).fields ?? []).some((field) => field.startsWith('specialRequests.')),
  );
}

interface ToolResult {
  name: string;
  args: unknown;
  value: unknown;
}

/** Tool results in order, each with the arguments of the call it answers. */
function toolResults(prompt: PromptMessage[]): ToolResult[] {
  const argsById = new Map<string, unknown>();
  const results: ToolResult[] = [];
  for (const message of prompt) {
    for (const part of parts(message)) {
      if (part.type === 'tool-call' && part.toolCallId) argsById.set(part.toolCallId, (part as { input?: unknown }).input);
      if (part.type === 'tool-result' && part.toolName) {
        results.push({ name: part.toolName, args: parseJson(argsById.get(part.toolCallId ?? '')) ?? {}, value: parseJson(part.output?.value) });
      }
    }
  }
  return results;
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

function format(value: unknown): string {
  if (value && typeof value === 'object') return Object.values(value).join(' → ');
  return String(value);
}
