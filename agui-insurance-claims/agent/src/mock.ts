import { randomUUID } from 'node:crypto';
import { EventType } from '@ag-ui/core';
import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import type { EmitFn } from './agent.js';
import { validateFormDef } from './validate.js';

/**
 * Deterministic stand-in for the Anthropic loop, enabled with MOCK_AGENT=1.
 * Lets the demo run end to end (streaming text, form rendering, pre-fill,
 * conditional widgets, submit, confirmation) without an ANTHROPIC_API_KEY.
 */

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

export async function runMockAgent(input: RunAgentInput, emit: EmitFn): Promise<void> {
  const last = input.messages[input.messages.length - 1];

  // A form was submitted -> confirm the claim.
  if (last?.role === 'tool') {
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
      `Your claim CLM-2026-${String(Math.floor(1000 + Math.random() * 9000))} has been filed${summary}. ` +
        'An assessor will review it within 2 business days. Anything else I can help with?',
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

  const toolCallId = randomUUID();
  const args = {
    formDef: CLAIM_FORM_DEF,
    data: { incident: { country: 'NL', city: 'Amsterdam', date: yesterday() } },
  };
  emit({
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: 'render_form',
  } as BaseEvent);
  emit({ type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(args) } as BaseEvent);
  emit({ type: EventType.TOOL_CALL_END, toolCallId } as BaseEvent);
}
