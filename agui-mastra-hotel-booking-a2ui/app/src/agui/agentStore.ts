import { useSyncExternalStore } from 'react';
import { HttpAgent, type RunAgentParameters } from '@ag-ui/client';
import type { BaseEvent, Message } from '@ag-ui/core';
import { LOG_A2UI_EVENT_TOOL_NAME } from '@hotel/shared';
import { reparentToolCalls } from './reparentToolCalls';

/**
 * The AG-UI client, as a tiny external store for React.
 *
 * `HttpAgent` owns the conversation: it POSTs the full history + the frontend
 * tools to the endpoint on every run, and applies the streamed events
 * (TEXT_MESSAGE_*, TOOL_CALL_*, TOOL_CALL_RESULT, ACTIVITY_SNAPSHOT…) to
 * `agent.messages`. This file only mirrors that into React and adds the two
 * moves a chat needs: send a user message, and send an A2UI action from a
 * surface the agent rendered.
 *
 * Nothing here knows about Mastra — point it at any AG-UI endpoint.
 */

export interface AgentSnapshot {
  messages: Message[];
  running: boolean;
  error: string | null;
  /** Every AG-UI event received, for the inspector panel. */
  events: BaseEvent[];
}

/** A UI action from an A2UI surface (the shape @ag-ui/a2ui-middleware reads from forwardedProps). */
export interface A2uiUserAction {
  name: string;
  surfaceId: string;
  sourceComponentId: string;
  timestamp: string;
  context: Record<string, unknown>;
}

export interface AgentStore {
  getSnapshot(): AgentSnapshot;
  subscribe(listener: () => void): () => void;
  sendUserMessage(text: string): Promise<void>;
  sendA2uiAction(action: A2uiUserAction): Promise<void>;
  hasToolResult(toolCallId: string): boolean;
  toolResult(toolCallId: string): unknown;
  reset(): void;
}

export function createAgentStore(url: string): AgentStore {
  let agent = new HttpAgent({ url });
  let snapshot: AgentSnapshot = { messages: [], running: false, error: null, events: [] };
  /** Messages the server added to this run's input that the client must keep too (see sendA2uiAction). */
  let mirror: { at: number; messages: Message[] } | null = null;
  const listeners = new Set<() => void>();

  const update = (patch: Partial<AgentSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };

  const withMirror = (messages: readonly Message[]): Message[] =>
    mirror ? [...messages.slice(0, mirror.at), ...mirror.messages, ...messages.slice(mirror.at)] : [...messages];

  const subscribeTo = (target: HttpAgent) =>
    target.subscribe({
      // Fires after each event has been applied to agent.messages, so the chat
      // re-renders while text streams in.
      onEvent: ({ event, messages }) => {
        const events = [...snapshot.events, event];
        update({ messages: reparentToolCalls(withMirror(messages), events), events });
      },
      onRunFailed: ({ error }) => update({ error: error.message }),
    });
  subscribeTo(agent);

  async function run(parameters: RunAgentParameters = {}) {
    update({ running: true, error: null, messages: withMirror(agent.messages) });
    try {
      await agent.runAgent(parameters);
    } catch (error) {
      update({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      // Fix the history the NEXT run will send (see reparentToolCalls).
      agent.setMessages(reparentToolCalls(withMirror(agent.messages), snapshot.events));
      mirror = null;
      update({ running: false, messages: [...agent.messages] });
    }
  }

  const findResult = (toolCallId: string) =>
    snapshot.messages.find((message) => message.role === 'tool' && message.toolCallId === toolCallId);

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async sendUserMessage(text) {
      agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text });
      await run();
    },
    /**
     * The AG-UI way to send an A2UI action: `forwardedProps.a2uiAction`. The
     * middleware turns it into a synthetic `log_a2ui_event` tool call + result
     * appended to the run's input — on the SERVER only. The browser owns the
     * history, so it keeps the same pair, or the next run would forget what
     * the guest submitted.
     */
    async sendA2uiAction(action) {
      const runId = crypto.randomUUID();
      const toolCallId = `a2ui-action-${runId}`;
      const { name, surfaceId, sourceComponentId, context } = action;
      mirror = {
        at: agent.messages.length,
        messages: [
          {
            id: `${toolCallId}-call`,
            role: 'assistant',
            content: '',
            toolCalls: [{ id: toolCallId, type: 'function', function: { name: LOG_A2UI_EVENT_TOOL_NAME, arguments: JSON.stringify(action) } }],
          },
          {
            id: `${toolCallId}-result`,
            role: 'tool',
            toolCallId,
            // The middleware's wording (formatUserActionResult), so every run reads the same.
            content: `User performed action "${name}" on surface "${surfaceId}" (component: ${sourceComponentId}). Context: ${JSON.stringify(context)}`,
          },
        ],
      };
      await run({ runId, forwardedProps: { a2uiAction: { userAction: action } } });
    },
    hasToolResult: (toolCallId) => findResult(toolCallId) !== undefined,
    toolResult(toolCallId) {
      const message = findResult(toolCallId);
      if (!message || typeof message.content !== 'string') return undefined;
      try {
        return JSON.parse(message.content);
      } catch {
        return message.content;
      }
    },
    reset() {
      agent.abortRun();
      agent = new HttpAgent({ url });
      subscribeTo(agent);
      mirror = null;
      update({ messages: [], running: false, error: null, events: [] });
    },
  };
}

export function useAgent(store: AgentStore): AgentSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
