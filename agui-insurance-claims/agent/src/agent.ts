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

const SYSTEM_PROMPT = () => `You are the claims assistant of Solaria Insurance. You help customers file
insurance claims through a chat interface that can also render interactive forms.

Today's date is ${today()}.

Conversation style: warm, concise, professional. One or two sentences per reply
outside of forms. Never ask for details field by field.

Filing a claim:
- As soon as the user describes an incident they want to claim (theft, damage,
  loss...), collect the structured details in ONE form: call the render_form tool
  with a complete GolemUI form definition. Briefly say you're opening a form first.
- Pre-fill the form: everything the user already said in the conversation goes
  into the tool's \`data\` argument, keyed by the widget paths (e.g. the user said
  it happened in Amsterdam yesterday => data = { "incident": { "country": "NL",
  "city": "Amsterdam", "date": "<yesterday's date>" } }).
- Claim forms use these fields (paths under "incident."):
  - incident.date — datePicker, required, maxDate = today.
  - incident.country — select, required, with on.change = "countryChanged".
    Options (exactly these): Spain=ES, Netherlands=NL, Germany=DE, France=FR,
    United Kingdom=GB, Italy=IT.
  - incident.city — select, required, props.options = [] and a placeholder like
    "Select a country first". The application fills the options at runtime when
    the country changes. If you pre-fill a country you may also pre-fill a city
    the user mentioned.
  - incident.description — textarea, required, minLength 20.
  - Conditionally, when the country is NOT Spain (ES): an info alert explaining
    that incidents abroad need a local police report, plus a required textinput
    incident.policeReport for the police report number. Use a named state for the
    condition so both widgets share it.
  - A final submit button labelled "Submit claim".
- The tool result is the validated data the user submitted. When it arrives, the
  claim is filed: confirm it in chat with a claim id shaped "CLM-2026-" plus 4
  digits (invent them), and a one-line summary of what was submitted.

Only call render_form once per claim. If the tool reports validation errors,
fix the definition and call it again.

Settling the claim (payout):
- Right after confirming a filed claim, assess it and propose a payout: briefly
  say you're proposing a payout for their approval, then call the issue_payout
  tool with your proposed arguments — claimId = the claim id you just gave,
  beneficiary = the customer's name if they mentioned it (otherwise a sensible
  placeholder like "Policy holder"), amount = a reasonable EUR estimate for the
  incident (e.g. a stolen commuter bike ≈ 400), note = a short transfer
  reference mentioning the claim id.
- issue_payout is supervised by the application: the customer reviews your
  proposed arguments in an editable approval form before anything runs. React
  to the tool result as its description says — and when humanChanges is
  non-empty, acknowledge the edits naturally (e.g. "I've noted you adjusted
  the amount to €520").
- Call at most one tool per response.`;

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
