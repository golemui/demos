import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { EventType } from '@ag-ui/core';
import type { BaseEvent, Message, RunAgentInput } from '@ag-ui/core';
import { validateFormDef } from './validate.js';

const MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-5';
const MAX_TOKENS = 8192;
/** First attempt + up to 2 self-correction retries when render_form args fail validation. */
const MAX_ATTEMPTS = 3;

const today = () => new Date().toISOString().slice(0, 10);

const SYSTEM_PROMPT = () => `You are the booking concierge of Hotel Aurora. You help guests book a stay
through a chat interface that can also render interactive forms.

Today's date is ${today()}.

Conversation style: warm, concise, professional. One or two sentences per reply
outside of forms. Never ask for details field by field — use a form.

Rates (for your reference; you NEVER compute the price yourself — the app does):
room €60/night, +€10/night per guest, half board +€10/night per guest, full
board +€20/night per guest, car: sports +€45/night, compact +€25/night,
SUV +€30/night. Rooms sleep up to 4 guests; stays are at most 30 nights.

Booking flow — follow these steps in order, ONE tool call per response:

1) Stay details. When the guest wants to book, call render_form with a GolemUI
   form for the stay. Pre-fill everything already said into the 'data' argument
   under "stay.". Fields (paths under "stay."):
   - stay.dates — rangeDatePicker (arrival → departure in ONE widget; its value
     is an ARRAY OF RANGE OBJECTS: [{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }]),
     validator { "type": "array", "required": true }, props.minDate = today,
     on.change = "datesChanged". The app caps the range at 30 nights from the
     chosen arrival — DON'T hard-code a maxDate.
   - stay.guests — number, required, minimum 1, maximum 4.
   - stay.board — select, required, options: No board=none, Half board=half,
     Full board=full.
   - A submit button labelled "Continue".

2) Car offer — YOU do the branching, in two small forms; NEVER use conditional
   visibility ("include"/"states") for this:
   a. First, render_form with ONE field: stay.wantsCar — select "Add a rental
      car?", options Yes=yes / No=no, required — and a submit button "Continue".
      Suggest the car: pre-fill stay.wantsCar = "yes" in 'data'.
   b. If the result says wantsCar = "yes", render_form again with ONE field:
      stay.car — select "Car type", options Sports car (2 seats)=sport,
      Compact (4 seats)=compact, SUV (5 seats)=suv, required — and a submit
      button "Review booking". If wantsCar = "no", skip straight to step 3.

3) Review & confirm. Now call the confirm_booking tool with your proposed booking:
   dates = stay.dates exactly as submitted (the [{ "start", "end" }] range
   array), guests, board (none|half|full), and car (none|sport|compact|suv —
   use "none" if they declined a car). The app prices it, shows the guest a
   live breakdown, and lets them edit before confirming. React to the tool result
   as its description says: if humanChanges is non-empty, acknowledge each change
   and the final total in one line (e.g. "Updated to full board — your new total is
   €X"); if the booking was rejected, ask what they'd like to change.

4) Payment. Right after a successful confirm_booking, call the collect_payment
   tool with amount = the result's total and reference = the booking id, with a
   short lead-in line ("Last step — let's take the payment:"). The app renders
   a secure card checkout; react to the tool result as its description says.
   After a successful payment, close warmly — the booking is complete.

If render_form reports validation errors, fix the definition and call it again.`;

// ---------------------------------------------------------------------------
// AG-UI messages -> Anthropic messages
// ---------------------------------------------------------------------------

function toAnthropicMessages(messages: Message[]): {
  system: string;
  history: Anthropic.MessageParam[];
} {
  const systemParts: string[] = [];
  const history: Anthropic.MessageParam[] = [];

  const pushUserBlocks = (blocks: Anthropic.ContentBlockParam[]) => {
    const last = history[history.length - 1];
    if (last && last.role === 'user' && Array.isArray(last.content)) {
      (last.content as Anthropic.ContentBlockParam[]).push(...blocks);
    } else {
      history.push({ role: 'user', content: blocks });
    }
  };

  for (const message of messages) {
    switch (message.role) {
      case 'system':
      case 'developer':
        if (message.content) systemParts.push(message.content);
        break;
      case 'user':
        if (typeof message.content === 'string') {
          pushUserBlocks([{ type: 'text', text: message.content }]);
        }
        break;
      case 'assistant': {
        const blocks: Anthropic.ContentBlockParam[] = [];
        if (message.content) blocks.push({ type: 'text', text: message.content });
        for (const call of message.toolCalls ?? []) {
          let input: unknown = {};
          try {
            input = JSON.parse(call.function.arguments || '{}');
          } catch {
            input = {};
          }
          blocks.push({
            type: 'tool_use',
            id: call.id,
            name: call.function.name,
            input,
          });
        }
        if (blocks.length > 0) history.push({ role: 'assistant', content: blocks });
        break;
      }
      case 'tool':
        pushUserBlocks([
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: message.content,
            is_error: Boolean(message.error),
          },
        ]);
        break;
      default:
        // activity / reasoning messages are not replayed to the model
        break;
    }
  }

  return { system: systemParts.join('\n\n'), history };
}

// ---------------------------------------------------------------------------
// Agent run loop
// ---------------------------------------------------------------------------

export type EmitFn = (event: BaseEvent) => void;

export async function runAgent(input: RunAgentInput, emit: EmitFn): Promise<void> {
  const anthropic = new Anthropic();
  const { system, history } = toAnthropicMessages(input.messages);

  const tools: Anthropic.Tool[] = (input.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool.InputSchema,
  }));

  const systemPrompt = system ? `${SYSTEM_PROMPT()}\n\n${system}` : SYSTEM_PROMPT();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const messageId = randomUUID();
    let textOpen = false;

    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: history,
      tools,
    });

    stream.on('text', (delta) => {
      if (!textOpen) {
        textOpen = true;
        emit({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent);
      }
      emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta } as BaseEvent);
    });

    const final = await stream.finalMessage();
    if (textOpen) {
      emit({ type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent);
    }

    const toolUses = final.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (final.stop_reason !== 'tool_use' || toolUses.length === 0) {
      return; // plain text answer — run is complete
    }

    const renderForm = toolUses.find((block) => block.name === 'render_form');

    // A frontend tool other than render_form: forward it to the client as-is.
    if (!renderForm) {
      for (const toolUse of toolUses) emitToolCall(emit, toolUse, textOpen ? messageId : undefined);
      return;
    }

    const args = renderForm.input as { formDef?: unknown; data?: unknown };
    const outcome = validateFormDef(args.formDef);

    if (outcome.valid) {
      // Hand the (guaranteed-valid) form to the frontend. The run ends here; the
      // submitted data arrives as a tool-result message in the NEXT run.
      emitToolCall(emit, renderForm, textOpen ? messageId : undefined);
      return;
    }

    console.warn(`[agent] render_form validation failed (attempt ${attempt}/${MAX_ATTEMPTS})`);
    console.warn(outcome.report);

    // Self-correction: feed the validation errors back as a tool error and retry.
    history.push({ role: 'assistant', content: final.content });
    history.push({
      role: 'user',
      content: toolUses.map((toolUse) => ({
        type: 'tool_result' as const,
        tool_use_id: toolUse.id,
        is_error: true,
        content:
          toolUse.id === renderForm.id
            ? outcome.report
            : 'Not executed: fix the render_form definition first.',
      })),
    });
  }

  // Retries exhausted — tell the user instead of failing the whole run.
  const failureId = randomUUID();
  emit({ type: EventType.TEXT_MESSAGE_START, messageId: failureId, role: 'assistant' } as BaseEvent);
  emit({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: failureId,
    delta:
      "Sorry — I couldn't put together a valid claim form after several tries. ",
  } as BaseEvent);
  emit({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: failureId,
    delta: 'Could you tell me the incident details in chat instead?',
  } as BaseEvent);
  emit({ type: EventType.TEXT_MESSAGE_END, messageId: failureId } as BaseEvent);
}

function emitToolCall(emit: EmitFn, toolUse: Anthropic.ToolUseBlock, parentMessageId?: string): void {
  emit({
    type: EventType.TOOL_CALL_START,
    toolCallId: toolUse.id,
    toolCallName: toolUse.name,
    parentMessageId,
  } as BaseEvent);
  emit({
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: toolUse.id,
    delta: JSON.stringify(toolUse.input ?? {}),
  } as BaseEvent);
  emit({ type: EventType.TOOL_CALL_END, toolCallId: toolUse.id } as BaseEvent);
}
