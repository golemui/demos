import type { AssistantMessage, BaseEvent, Message } from '@ag-ui/core';

/**
 * Moves each tool call to the assistant message that actually emitted it.
 *
 * Why: in a multi-step run (text → server tool → more text → frontend tool),
 * @ag-ui/mastra 2.0.0 parents EVERY tool call of the run to the run's FIRST
 * assistant message, while the later text arrives as a separate message. Left
 * as is, the chat renders the form above the text that introduces it, and —
 * worse — the history replayed on the next run ends with an assistant message
 * (the later text sits after the tool results), which the model reads as the
 * conversation's last word.
 *
 * The event stream has the true order, so a call belongs to the last assistant
 * message whose text started before the call did.
 */
export function reparentToolCalls(messages: readonly Message[], events: readonly BaseEvent[]): Message[] {
  const firstSeen = new Map<string, number>();
  events.forEach((event, index) => {
    const { messageId, toolCallId } = event as BaseEvent & { messageId?: string; toolCallId?: string };
    const id = event.type === 'TOOL_CALL_START' ? toolCallId : event.type.startsWith('TEXT_MESSAGE') ? messageId : undefined;
    if (id && !firstSeen.has(id)) firstSeen.set(id, index);
  });

  const assistants = messages.filter(
    (message): message is AssistantMessage => message.role === 'assistant' && firstSeen.has(message.id),
  );
  const moves = new Map<string, string>(); // toolCallId → target message id
  for (const owner of assistants) {
    const ownerAt = firstSeen.get(owner.id)!;
    for (const call of owner.toolCalls ?? []) {
      const callAt = firstSeen.get(call.id);
      if (callAt === undefined) continue;
      const target = assistants
        .filter((candidate) => {
          const at = firstSeen.get(candidate.id)!;
          return at > ownerAt && at < callAt;
        })
        .at(-1);
      if (target) moves.set(call.id, target.id);
    }
  }
  if (moves.size === 0) return [...messages];

  const moved = assistants.flatMap((message) => (message.toolCalls ?? []).filter((call) => moves.has(call.id)));
  return messages.map((message) => {
    if (message.role !== 'assistant') return message;
    const assistant = message as AssistantMessage;
    const kept = (assistant.toolCalls ?? []).filter((call) => !moves.has(call.id));
    const received = moved.filter((call) => moves.get(call.id) === message.id);
    if (kept.length === (assistant.toolCalls ?? []).length && received.length === 0) return message;
    const toolCalls = [...kept, ...received];
    return { ...assistant, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  });
}
