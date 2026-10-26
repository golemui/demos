import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ActivityMessage, AssistantMessage, Message, ToolCall } from '@ag-ui/core';
import { DISMISSED_RESULT, LOG_A2UI_EVENT_TOOL_NAME, RENDER_A2UI_TOOL_NAME } from '@hotel/shared';
import { A2uiActivity, type A2uiActivityContent } from '../a2ui/A2uiActivity';
import { useAgent, type AgentStore } from './agentStore';
import type { ToolSurfaceRegistry } from './toolSurfaces';

interface ChatPanelProps {
  store: AgentStore;
  surfaces: ToolSurfaceRegistry;
  suggestions: string[];
  blurb: string;
  hidden?: boolean;
}

/** What the app tells the agent when the renderer refuses a surface (A2UI's renderer → agent error path). */
const REPAIR_PREFIX = 'The A2UI surface you rendered was REJECTED by the renderer';
const MAX_REPAIRS_PER_TURN = 2;

/**
 * A generic AG-UI chat: user/assistant bubbles, plus one surface per tool call.
 * Frontend tools render the component registered for their name; any other
 * call is a SERVER tool (it ran inside the agent) and shows as a status chip.
 * `a2ui-surface` ACTIVITY messages (from @ag-ui/a2ui-middleware) render with
 * the A2UI renderer, and their actions go back through the store.
 */
export function ChatPanel({ store, surfaces, suggestions, blurb, hidden }: ChatPanelProps) {
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
    <section className="chat" hidden={hidden}>
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
            surfaces={surfaces}
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
  surfaces: ToolSurfaceRegistry;
  onRejected: (reason: string) => void;
}

function MessageView({ message, answered, store, surfaces, onRejected }: MessageViewProps) {
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
        <ToolCallView key={call.id} call={call} store={store} surfaces={surfaces} />
      ))}
    </>
  );
}

function ToolCallView({ call, store, surfaces }: { call: ToolCall; store: AgentStore; surfaces: ToolSurfaceRegistry }) {
  // Stable identity per argument string, so surfaces don't re-create their form config on every render.
  const args = useMemo(() => parseArgs(call.function.arguments), [call.function.arguments]);
  const answered = store.hasToolResult(call.id);
  const Surface = surfaces[call.function.name];

  // The surface itself arrives as an ACTIVITY message; the call is just its transport.
  if (call.function.name === RENDER_A2UI_TOOL_NAME) return null;
  if (call.function.name === LOG_A2UI_EVENT_TOOL_NAME) return <ActionChip action={args ?? {}} />;

  if (!Surface) {
    // A server tool: Mastra executed it; AG-UI streamed the call and its result.
    return (
      <div className={`tool-chip ${answered ? 'tool-chip--done' : ''}`}>
        <span className="material-icons">{answered ? 'check_circle' : 'sync'}</span>
        <code>{call.function.name}</code>
        <span>{answered ? 'ran on the server' : 'running on the server…'}</span>
        {answered && <code className="tool-chip__result">{JSON.stringify(store.toolResult(call.id))}</code>}
      </div>
    );
  }

  if (answered && (store.toolResult(call.id) as { status?: string } | undefined)?.status === DISMISSED_RESULT.status) {
    return (
      <div className="tool-chip">
        <span className="material-icons">do_not_disturb_on</span>
        <code>{call.function.name}</code>
        <span>closed — the guest wrote in the chat</span>
      </div>
    );
  }

  // Args arrive as a stream of JSON deltas: mount the form only once the call
  // is complete (TOOL_CALL_END), or GolemUI would re-initialise it on every chunk.
  if (!args || !store.isToolCallComplete(call.id)) return <div className="tool-chip"><span className="material-icons">hourglass_top</span>Preparing…</div>;

  return (
    <Surface
      toolCallId={call.id}
      args={args}
      result={answered ? store.toolResult(call.id) : undefined}
      respond={(result) => void store.sendToolResult(call.id, result)}
    />
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
