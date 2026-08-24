import { randomUUID } from 'node:crypto';
import { EventType } from '@ag-ui/core';
import type { AssistantMessage, BaseEvent, RunAgentInput } from '@ag-ui/core';
import type { EmitFn } from './agent.js';
import { validateFormDef } from './validate.js';

/**
 * Deterministic stand-in for the Anthropic loop, enabled with MOCK_AGENT=1.
 * Runs the full hotel booking demo end to end without an ANTHROPIC_API_KEY:
 * stay form -> car question -> car type (render_form ×3, agent-side branching)
 * -> confirm_booking (schema-derived harness step with price breakdown and
 * edit diff) -> collect_payment (hand-crafted animated card checkout).
 */

const iso = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};

// ---- Form definitions the "LLM" authors (validated before they ship) --------

const STAY_FORM_DEF = {
  form: [
    // One range widget for arrival→departure (value: [{ start, end }] — an
    // array of range objects, one per selected range); the app's
    // datesChanged handler caps the range at 30 nights from the chosen start.
    {
      kind: 'input',
      type: 'rangeDatePicker',
      path: 'stay.dates',
      label: 'Stay (arrival → departure)',
      on: { change: 'datesChanged' },
      props: { minDate: iso(0) },
      // The range value is an ARRAY of range objects: [{ start, end }].
      validator: {
        type: 'array',
        required: true,
        messages: { invalid: 'Pick your arrival and departure dates' },
      },
    },
    {
      kind: 'input',
      type: 'number',
      path: 'stay.guests',
      label: 'Guests',
      validator: {
        type: 'number',
        required: true,
        minimum: 1,
        maximum: 4,
        messages: {
          invalid: 'How many guests? (1–4)',
          minimum: 'At least 1 guest',
          maximum: 'Up to 4 guests per room',
        },
      },
    },
    {
      kind: 'input',
      type: 'select',
      path: 'stay.board',
      label: 'Board',
      props: {
        options: [
          { label: 'No board', value: 'none' },
          { label: 'Half board (+€10/night per guest)', value: 'half' },
          { label: 'Full board (+€20/night per guest)', value: 'full' },
        ],
        placeholder: 'Choose a board option',
      },
      validator: {
        type: 'string',
        required: true,
        messages: { invalid: 'Choose a board option', required: 'Choose a board option' },
      },
    },
    { kind: 'action', type: 'button', actionType: 'submit', label: 'Continue', props: { variant: 'filled' } },
  ],
};

const CAR_QUESTION_FORM_DEF = {
  form: [
    {
      kind: 'input',
      type: 'select',
      path: 'stay.wantsCar',
      label: 'Add a rental car?',
      props: {
        options: [
          { label: 'Yes, add a car', value: 'yes' },
          { label: 'No, thanks', value: 'no' },
        ],
        placeholder: 'Would you like a car?',
      },
      validator: {
        type: 'string',
        required: true,
        messages: { invalid: 'Let us know about the car', required: 'Let us know about the car' },
      },
    },
    { kind: 'action', type: 'button', actionType: 'submit', label: 'Continue', props: { variant: 'filled' } },
  ],
};

// The car TYPE arrives as its own form only when the guest said yes: the
// branching lives in the agent, not in runtime conditionals. (In-form
// include/disabled toggling is unreliable once several gui-form instances
// have lived in the same thread — gui 1.2.1, see README finding.)
const CAR_TYPE_FORM_DEF = {
  form: [
    {
      kind: 'input',
      type: 'select',
      path: 'stay.car',
      label: 'Car type',
      props: {
        options: [
          { label: 'Sports car — 2 seats (+€45/night)', value: 'sport' },
          { label: 'Compact — 4 seats (+€25/night)', value: 'compact' },
          { label: 'SUV — 5 seats (+€30/night)', value: 'suv' },
        ],
        placeholder: 'Pick a car',
      },
      validator: {
        type: 'string',
        required: true,
        messages: { invalid: 'Pick a car', required: 'Pick a car' },
      },
    },
    { kind: 'action', type: 'button', actionType: 'submit', label: 'Review booking', props: { variant: 'filled' } },
  ],
};

// ---- Streaming helpers ------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function streamText(emit: EmitFn, text: string): Promise<void> {
  const messageId = randomUUID();
  emit({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent);
  for (const word of text.split(/(?<= )/)) {
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: word } as BaseEvent);
    await sleep(15);
  }
  emit({ type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent);
}

function emitToolCall(emit: EmitFn, name: string, args: unknown): void {
  const toolCallId = randomUUID();
  emit({ type: EventType.TOOL_CALL_START, toolCallId, toolCallName: name } as BaseEvent);
  emit({ type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(args) } as BaseEvent);
  emit({ type: EventType.TOOL_CALL_END, toolCallId } as BaseEvent);
}

/** Finds which tool a tool-result message answers, by its toolCallId. */
function toolCallName(input: RunAgentInput, toolCallId: string): string | undefined {
  for (const message of input.messages) {
    if (message.role !== 'assistant') continue;
    for (const call of (message as AssistantMessage).toolCalls ?? []) {
      if (call.id === toolCallId) return call.function.name;
    }
  }
  return undefined;
}

/** Merges the `stay` object from every submitted form in the thread so far. */
function collectStay(input: RunAgentInput): Record<string, unknown> {
  const stay: Record<string, unknown> = {};
  for (const message of input.messages) {
    if (message.role !== 'tool') continue;
    try {
      const data = JSON.parse(message.content) as { stay?: Record<string, unknown> };
      if (data.stay) Object.assign(stay, data.stay);
    } catch {
      // ignore non-JSON tool results
    }
  }
  return stay;
}

// ---- The mock agent ---------------------------------------------------------

export async function runMockAgent(input: RunAgentInput, emit: EmitFn): Promise<void> {
  const last = input.messages[input.messages.length - 1];

  if (last?.role === 'tool') {
    const answering = toolCallName(input, last.toolCallId);

    // A form came back -> decide the next step from what we know so far.
    // The BRANCHING lives here, in the agent: ask about the car; if the guest
    // says yes, send the car-type form; then propose the booking for review.
    if (answering === 'render_form') {
      const stay = collectStay(input);

      const sendForm = (intro: string, formDef: unknown, data?: unknown) => {
        const outcome = validateFormDef(formDef);
        if (!outcome.valid) throw new Error(`Mock form is invalid:\n${outcome.report}`);
        return streamText(emit, intro).then(() =>
          emitToolCall(emit, 'render_form', { formDef, data: data ?? {} }),
        );
      };

      // Stay submitted, car not asked yet -> car question (agent suggests yes).
      if (!('wantsCar' in stay)) {
        await sendForm(
          'Great — now, would you like a rental car for your stay?',
          CAR_QUESTION_FORM_DEF,
          { stay: { wantsCar: 'yes' } },
        );
        return;
      }

      // Guest wants a car but has not picked one -> car-type form.
      if (stay['wantsCar'] === 'yes' && !stay['car']) {
        await sendForm('Nice — which car would you like?', CAR_TYPE_FORM_DEF);
        return;
      }

      // Everything collected -> propose the booking for review/confirmation.
      // stay.dates is already the range-array shape confirm_booking expects.
      await streamText(emit, "Here's your booking — take a look and confirm or tweak anything.");
      emitToolCall(emit, 'confirm_booking', {
        dates: stay['dates'] ?? [],
        guests: stay['guests'],
        board: stay['board'] ?? 'none',
        car: stay['wantsCar'] === 'yes' ? (stay['car'] ?? 'none') : 'none',
      });
      return;
    }

    // Booking reviewed -> confirm (acknowledging any edits) or handle rejection.
    if (answering === 'confirm_booking') {
      let outcome;
      try {
        outcome = JSON.parse(last.content) as {
          status?: string;
          humanChanges?: Array<{ path: string; proposed: unknown; approved: unknown }>;
          total?: number;
          result?: { bookingId?: string; total?: number };
        };
      } catch {
        outcome = {} as never;
      }
      if (outcome.status !== 'approved') {
        await streamText(emit, 'No problem — what would you like to change about the booking?');
        return;
      }
      const fmt = (v: unknown): string =>
        v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v);
      const edits = (outcome.humanChanges ?? [])
        .map((c) => `${c.path}: ${fmt(c.proposed)} → ${fmt(c.approved)}`)
        .join(', ');
      const total = outcome.result?.total ?? outcome.total;
      const bookingId = outcome.result?.bookingId ?? 'BKG-2026-????';
      await streamText(
        emit,
        `All set! Booking ${bookingId} is confirmed` +
          (typeof total === 'number' ? ` — total €${total.toFixed(2)}. ` : '. ') +
          (edits ? `I've applied your changes (${edits}). ` : '') +
          "Last step — let's take the payment:",
      );
      emitToolCall(emit, 'collect_payment', {
        amount: typeof total === 'number' ? total : 0,
        reference: bookingId,
      });
      return;
    }
  }

  if (last?.role === 'tool' && toolCallName(input, last.toolCallId) === 'collect_payment') {
    let payment;
    try {
      payment = JSON.parse(last.content) as {
        status?: string;
        amount?: number;
        brand?: string;
        last4?: string;
      };
    } catch {
      payment = {} as never;
    }
    if (payment.status !== 'paid') {
      await streamText(emit, 'No problem — the checkout is still open whenever you are ready.');
      return;
    }
    await streamText(
      emit,
      `Payment received — €${(payment.amount ?? 0).toFixed(2)} on your ` +
        `${payment.brand ?? 'card'} ending ${payment.last4 ?? '····'}. ` +
        'Your stay at Hotel Aurora is booked. We look forward to welcoming you! 🏨',
    );
    return;
  }

  // First user turn -> intro + the stay form, pre-filled with a couple of guesses.
  const outcome = validateFormDef(STAY_FORM_DEF);
  if (!outcome.valid) throw new Error(`Mock stay form is invalid:\n${outcome.report}`);

  await streamText(
    emit,
    "Welcome to Hotel Aurora! I've opened a quick form — tell me your dates and party size.",
  );
  emitToolCall(emit, 'render_form', {
    formDef: STAY_FORM_DEF,
    data: { stay: { dates: [{ start: iso(7), end: iso(9) }], guests: 2 } },
  });
}
