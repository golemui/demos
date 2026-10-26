import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { AssistantMessage, Message, ToolCall } from '@ag-ui/core';
import { DISMISSED_RESULT } from '@hotel/shared';
import { useAgent, type AgentStore } from './agentStore';
import type { ToolSurfaceRegistry } from './toolSurfaces';

interface ChatPanelProps {
  store: AgentStore;
  surfaces: ToolSurfaceRegistry;
  suggestions: string[];
  blurb: string;
}

/**
 * A generic AG-UI chat: user/assistant bubbles, plus one surface per tool call.
 * Frontend tools render the component registered for their name; any other
 * call is a SERVER tool (it ran inside the agent) and shows as a status chip.
 */
export function ChatPanel({ store, surfaces, suggestions, blurb }: ChatPanelProps) {
  const { messages, running, error } = useAgent(store);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, running]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || running) return;
    setDraft('');
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

        {messages.map((message) => (
          <MessageView key={message.id} message={message} store={store} surfaces={surfaces} />
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
  store: AgentStore;
  surfaces: ToolSurfaceRegistry;
}

function MessageView({ message, store, surfaces }: MessageViewProps) {
  if (message.role === 'user') {
    return <div className="bubble bubble--user">{typeof message.content === 'string' ? message.content : ''}</div>;
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

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return null;
  }
}
