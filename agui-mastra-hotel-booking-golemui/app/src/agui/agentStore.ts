import { useSyncExternalStore } from 'react';
import { HttpAgent } from '@ag-ui/client';
import { EventType, type AssistantMessage, type BaseEvent, type Message, type Tool, type ToolCallEndEvent } from '@ag-ui/core';
import { DISMISSED_RESULT } from '@hotel/shared';
import { reparentToolCalls } from './reparentToolCalls';

/**
 * The AG-UI client, as a tiny external store for React.
 *
 * `HttpAgent` owns the conversation: it POSTs the full history + the frontend
 * tools to the endpoint on every run, and applies the streamed events
 * (TEXT_MESSAGE_*, TOOL_CALL_*, TOOL_CALL_RESULT, ACTIVITY_SNAPSHOT…) to
 * `agent.messages`. This file only mirrors that into React and adds the two
 * moves a chat needs: send a user message, and answer a frontend tool call.
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

export interface AgentStore {
  getSnapshot(): AgentSnapshot;
  subscribe(listener: () => void): () => void;
  sendUserMessage(text: string): Promise<void>;
  sendToolResult(toolCallId: string, result: unknown): Promise<void>;
  hasToolResult(toolCallId: string): boolean;
  /** True once TOOL_CALL_END arrived, i.e. the streamed arguments are complete. */
  isToolCallComplete(toolCallId: string): boolean;
  toolResult(toolCallId: string): unknown;
  reset(): void;
}

export function createAgentStore(url: string, tools: Tool[]): AgentStore {
  let agent = new HttpAgent({ url });
  let snapshot: AgentSnapshot = { messages: [], running: false, error: null, events: [] };
  const listeners = new Set<() => void>();

  const update = (patch: Partial<AgentSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };

  const subscribeTo = (target: HttpAgent) =>
    target.subscribe({
      // Fires after each event has been applied to agent.messages, so the chat
      // re-renders while text streams in.
      onEvent: ({ event, messages }) => {
        const events = [...snapshot.events, event];
        update({ messages: reparentToolCalls(messages, events), events });
      },
      onRunFailed: ({ error }) => update({ error: error.message }),
    });
  subscribeTo(agent);

  async function run() {
    update({ running: true, error: null, messages: [...agent.messages] });
    try {
      await agent.runAgent({ tools });
    } catch (error) {
      update({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      // Fix the history the NEXT run will send (see reparentToolCalls).
      agent.setMessages(reparentToolCalls(agent.messages, snapshot.events));
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
      // A frontend tool still open (e.g. the checkout) is stale now: answer it,
      // or the history would carry a tool call without a result.
      const frontend = new Set(tools.map((tool) => tool.name));
      const answered = new Set(agent.messages.flatMap((message) => (message.role === 'tool' ? [message.toolCallId] : [])));
      for (const message of agent.messages) {
        for (const call of message.role === 'assistant' ? ((message as AssistantMessage).toolCalls ?? []) : []) {
          if (frontend.has(call.function.name) && !answered.has(call.id)) {
            agent.addMessage({ id: crypto.randomUUID(), role: 'tool', toolCallId: call.id, content: JSON.stringify(DISMISSED_RESULT) });
          }
        }
      }
      agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text });
      await run();
    },
    async sendToolResult(toolCallId, result) {
      agent.addMessage({ id: crypto.randomUUID(), role: 'tool', toolCallId, content: JSON.stringify(result) });
      await run();
    },
    hasToolResult: (toolCallId) => findResult(toolCallId) !== undefined,
    isToolCallComplete: (toolCallId) =>
      snapshot.events.some((event) => event.type === EventType.TOOL_CALL_END && (event as ToolCallEndEvent).toolCallId === toolCallId),
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
      update({ messages: [], running: false, error: null, events: [] });
    },
  };
}

export function useAgent(store: AgentStore): AgentSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
