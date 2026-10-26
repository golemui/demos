import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ActivityMessage, AssistantMessage, Message, ToolCall } from '@ag-ui/core';
import { LOG_A2UI_EVENT_TOOL_NAME, RENDER_A2UI_TOOL_NAME } from '@hotel/shared';
import { A2uiActivity, type A2uiActivityContent } from '../a2ui/A2uiActivity';
import { useAgent, type AgentStore } from './agentStore';

interface ChatPanelProps {
  store: AgentStore;
  suggestions: string[];
  blurb: string;
}

/** What the app tells the agent when the renderer refuses a surface (A2UI's renderer → agent error path). */
const REPAIR_PREFIX = 'The A2UI surface you rendered was REJECTED by the renderer';
const MAX_REPAIRS_PER_TURN = 2;

/**
 * A generic AG-UI chat: user/assistant bubbles, and `a2ui-surface` ACTIVITY
 * messages (from @ag-ui/a2ui-middleware) rendered with the A2UI renderer, whose
 * actions go back through the store. Every other tool call is a SERVER tool (it
 * ran inside the agent) and shows as a status chip.
 */
export function ChatPanel({ store, suggestions, blurb }: ChatPanelProps) {
  const { messages, running, error } = useAgent(store);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const repair = useRepair(store, running);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, running]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || running) return;
    setDraft('');
    repair.reset();
    void store.sendUserMessage(trimmed);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    send(draft);
  }

  return (
    <section className="chat">
      <div className="chat__thread">
        {messages.length === 0 && (
          <div className="chat__welcome">
            <span className="material-icons chat__welcome-icon">room_service</span>
            <h2>Hotel Aurora concierge</h2>
            <p>{blurb}</p>
            <div className="chat__suggestions">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" className="chip" onClick={() => send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageView
            key={message.id}
            message={message}
            answered={index < messages.length - 1 && isAnswered(messages.slice(index + 1))}
            store={store}
            onRejected={(reason) => repair.request(message.id, reason)}
          />
        ))}

        {running && <div className="chat__typing" aria-label="The concierge is typing"><span /><span /><span /></div>}
        {error && <div className="chat__error">⚠ {error}</div>}
        <div ref={endRef} />
      </div>

      <form className="chat__composer" onSubmit={onSubmit}>
        <input
          className="chat__input"
          placeholder="Message the concierge…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={running}
          aria-label="Message"
        />
        <button className="chat__send" type="submit" disabled={running || !draft.trim()} aria-label="Send">
          <span className="material-icons">send</span>
        </button>
      </form>
    </section>
  );
}

interface MessageViewProps {
  message: Message;
  answered: boolean;
  store: AgentStore;
  onRejected: (reason: string) => void;
}

function MessageView({ message, answered, store, onRejected }: MessageViewProps) {
  if (message.role === 'user') {
    const text = typeof message.content === 'string' ? message.content : '';
    if (text.startsWith(REPAIR_PREFIX)) {
      return (
        <div className="notice-chip">
          <span className="material-icons">build</span> Renderer error sent back to the agent — asking it to fix the surface
        </div>
      );
    }
    return <div className="bubble bubble--user">{text}</div>;
  }
  if (message.role === 'activity') {
    const activity = message as ActivityMessage;
    if (activity.activityType !== 'a2ui-surface') return null;
    return (
      <A2uiActivity
        content={activity.content as A2uiActivityContent}
        answered={answered}
        onAction={(action) => void store.sendA2uiAction(action)}
        onRejected={onRejected}
      />
    );
  }
  if (message.role !== 'assistant') return null;

  const assistant = message as AssistantMessage;
  return (
    <>
      {assistant.content && <div className="bubble bubble--assistant">{assistant.content}</div>}
      {(assistant.toolCalls ?? []).map((call) => (
        <ToolCallView key={call.id} call={call} store={store} />
      ))}
    </>
  );
}

function ToolCallView({ call, store }: { call: ToolCall; store: AgentStore }) {
  // The surface itself arrives as an ACTIVITY message; the call is just its transport.
  if (call.function.name === RENDER_A2UI_TOOL_NAME) return null;
  if (call.function.name === LOG_A2UI_EVENT_TOOL_NAME) return <ActionChip action={parseArgs(call.function.arguments) ?? {}} />;

  // A server tool: Mastra executed it; AG-UI streamed the call and its result.
  const answered = store.hasToolResult(call.id);
  return (
    <div className={`tool-chip ${answered ? 'tool-chip--done' : ''}`}>
      <span className="material-icons">{answered ? 'check_circle' : 'sync'}</span>
      <code>{call.function.name}</code>
      <span>{answered ? 'ran on the server' : 'running on the server…'}</span>
      {answered && <code className="tool-chip__result">{JSON.stringify(store.toolResult(call.id))}</code>}
    </div>
  );
}

/** An A2UI action the guest sent — with the context that went to the agent. */
function ActionChip({ action }: { action: Record<string, unknown> }) {
  return (
    <details className="action-chip">
      <summary>
        <span className="material-icons">touch_app</span>
        <code>{String(action.name)}</code> sent to the agent
      </summary>
      <pre>{JSON.stringify(action.context ?? {}, null, 2)}</pre>
    </details>
  );
}

/** A surface is stale once the guest acted on a later one or wrote in the chat. */
function isAnswered(later: Message[]): boolean {
  return later.some(
    (message) =>
      message.role === 'user' ||
      (message.role === 'assistant' && (message as AssistantMessage).toolCalls?.some((call) => call.function.name === LOG_A2UI_EVENT_TOOL_NAME)),
  );
}

/**
 * When the renderer refuses a surface, tell the agent why and let it render it
 * again — at most twice per guest message, once the current run has finished.
 */
function useRepair(store: AgentStore, running: boolean) {
  const seen = useRef(new Set<string>());
  const attempts = useRef(0);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (running || !pending) return;
    setPending(null);
    void store.sendUserMessage(`${REPAIR_PREFIX}: ${pending}. Render it again, fixed, using only the basic catalog's components and props.`);
  }, [running, pending, store]);

  return {
    request(messageId: string, reason: string) {
      if (seen.current.has(messageId) || attempts.current >= MAX_REPAIRS_PER_TURN) return;
      seen.current.add(messageId);
      attempts.current += 1;
      setPending(reason);
    },
    reset() {
      attempts.current = 0;
    },
  };
}

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return null;
  }
}
