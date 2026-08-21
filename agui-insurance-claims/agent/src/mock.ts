import { randomUUID } from 'node:crypto';
import { EventType } from '@ag-ui/core';
import type { AssistantMessage, BaseEvent, RunAgentInput } from '@ag-ui/core';
import type { EmitFn } from './agent.js';
import { validateFormDef } from './validate.js';

/**
 * Deterministic stand-in for the Anthropic loop, enabled with MOCK_AGENT=1.
 * Lets the demo run end to end (streaming text, form rendering, pre-fill,
 * conditional widgets, submit, claim confirmation, and the supervised
 * issue_payout approval round trip) without an ANTHROPIC_API_KEY.
 */

const CLAIM_ID = 'CLM-2026-4821';

const yesterday = () => {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
};

const CLAIM_FORM_DEF = {
  states: {
    abroad: "$form.incident?.country !== undefined && $form.incident?.country !== 'ES'",
  },
  form: [
    {
      // Date + country side by side — also exercises lazy-loading of a layout
      // widget, which real LLM-authored forms use routinely.
      kind: 'layout',
      type: 'flex',
      props: { direction: 'row', gap: 12 },
      children: [
        {
          kind: 'input',
          type: 'datePicker',
          path: 'incident.date',
          label: 'Date of incident',
          props: { maxDate: new Date().toISOString().slice(0, 10) },
          validator: {
            type: 'string',
            required: true,
            messages: {
              invalid: 'The incident date is required',
              required: 'The incident date is required',
            },
          },
        },
        {
          kind: 'input',
          type: 'select',
          path: 'incident.country',
          label: 'Country',
          on: { change: 'countryChanged' },
          props: {
            options: [
              { label: 'Spain', value: 'ES' },
              { label: 'Netherlands', value: 'NL' },
              { label: 'Germany', value: 'DE' },
              { label: 'France', value: 'FR' },
              { label: 'United Kingdom', value: 'GB' },
              { label: 'Italy', value: 'IT' },
            ],
            placeholder: 'Select a country',
          },
          validator: {
            type: 'string',
            required: true,
            messages: {
              invalid: 'Select the country where it happened',
              required: 'Select the country where it happened',
            },
          },
        },
      ],
    },
    {
      kind: 'input',
      type: 'select',
      path: 'incident.city',
      label: 'City',
      on: { load: 'countryChanged' },
      props: { options: [], placeholder: 'Select a country first' },
      validator: {
        type: 'string',
        required: true,
        messages: { invalid: 'Select the city', required: 'Select the city' },
      },
    },
    {
      kind: 'input',
      type: 'textarea',
      path: 'incident.description',
      label: 'What happened?',
      props: {
        minimumHeight: 100,
        autoGrow: true,
        placeholder: 'Describe the incident in detail',
      },
      validator: {
        type: 'string',
        required: true,
        minLength: 20,
        messages: {
          invalid: 'A description is required',
          required: 'A description is required',
          minLength: 'Please write at least 20 characters',
        },
      },
    },
    {
      kind: 'display',
      type: 'alert',
      include: { in: ['abroad'] },
      props: {
        level: 'info',
        text: 'Incidents outside Spain require a local police report number.',
      },
    },
    {
      kind: 'input',
      type: 'textinput',
      path: 'incident.policeReport',
      label: 'Police report number',
      include: { in: ['abroad'] },
      props: { placeholder: 'e.g. AMS-2026-12345' },
      validator: {
        type: 'string',
        required: true,
        messages: {
          invalid: 'The police report number is required',
          required: 'The police report number is required',
        },
      },
    },
    {
      kind: 'action',
      type: 'button',
      actionType: 'submit',
      label: 'Submit claim',
      props: { variant: 'filled' },
    },
  ],
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function streamText(emit: EmitFn, text: string): Promise<void> {
  const messageId = randomUUID();
  emit({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent);
  for (const word of text.split(/(?<= )/)) {
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: word } as BaseEvent);
    await sleep(20);
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

export async function runMockAgent(input: RunAgentInput, emit: EmitFn): Promise<void> {
  const last = input.messages[input.messages.length - 1];

  // The claim form was submitted -> confirm the claim, then propose a payout
  // through the supervised issue_payout tool (the harness round trip).
  if (last?.role === 'tool' && toolCallName(input, last.toolCallId) === 'render_form') {
    let summary = '';
    try {
      const data = JSON.parse(last.content) as {
        incident?: { city?: string; date?: string };
      };
      if (data.incident?.city && data.incident?.date) {
        summary = ` for the incident in ${data.incident.city} on ${data.incident.date}`;
      }
    } catch {
      // keep the generic confirmation
    }
    await streamText(
      emit,
      `Your claim ${CLAIM_ID} has been filed${summary}. Based on what you described, ` +
        'I propose a payout of €450 — please review and approve it below.',
    );
    emitToolCall(emit, 'issue_payout', {
      claimId: CLAIM_ID,
      beneficiary: 'Policy holder',
      amount: 450,
      note: `${CLAIM_ID} — stolen bike settlement`,
    });
    return;
  }

  // The payout was approved (possibly edited) or rejected -> close the loop.
  if (last?.role === 'tool' && toolCallName(input, last.toolCallId) === 'issue_payout') {
    let outcome;
    try {
      outcome = JSON.parse(last.content) as {
        status?: string;
        humanChanges?: Array<{ path: string; proposed: unknown; approved: unknown }>;
        result?: { transferId?: string };
      };
    } catch {
      outcome = {} as never;
    }
    if (outcome.status !== 'approved') {
      await streamText(
        emit,
        "Understood — I won't issue the payout. Tell me how you'd like to proceed.",
      );
      return;
    }
    const edits = (outcome.humanChanges ?? [])
      .map((change) => `${change.path}: ${change.proposed} → ${change.approved}`)
      .join(', ');
    await streamText(
      emit,
      `Done! Transfer ${outcome.result?.transferId ?? 'TRF-??????'} is on its way. ` +
        (edits
          ? `I've noted your adjustments before approval (${edits}). `
          : 'You approved my proposal as-is. ') +
        'Anything else I can help with?',
    );
    return;
  }

  // First user turn -> stream a short intro, then the (validated) claim form.
  const outcome = validateFormDef(CLAIM_FORM_DEF);
  if (!outcome.valid) {
    throw new Error(`Mock form definition is invalid:\n${outcome.report}`);
  }

  await streamText(
    emit,
    "I'm sorry to hear that! Let's get your claim filed — I've prepared a short form " +
      'and pre-filled what you already told me.',
  );

  emitToolCall(emit, 'render_form', {
    formDef: CLAIM_FORM_DEF,
    data: { incident: { country: 'NL', city: 'Amsterdam', date: yesterday() } },
  });
}
