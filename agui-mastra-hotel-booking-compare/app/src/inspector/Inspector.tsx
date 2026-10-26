import { useMemo, useState } from 'react';
import type { AssistantMessage, BaseEvent, Message } from '@ag-ui/core';
import { CHECK_AVAILABILITY_TOOL_NAME, FRONTEND_TOOLS, PURE_TOOL_NAMES, RENDER_A2UI_TOOL_NAME, type Variant } from '@hotel/shared';
import { useAgent, type AgentStore } from '../agui/agentStore';
import { useApiLog, type ApiCall } from '../api/hotelApi';

/**
 * What happens behind the chat: what actually reached the hotel API (and
 * who sent it), how much UI the agent had to write, and the raw AG-UI event
 * stream from the agent.
 */
export function Inspector({ store, variant }: { store: AgentStore; variant: Variant }) {
  const [tab, setTab] = useState<'api' | 'agui'>('api');
  const browserCalls = useApiLog();
  const { events, messages } = useAgent(store);
  const agentCalls = useMemo(() => serverToolCalls(messages), [messages]);
  const calls = variant === 'golem' ? browserCalls : agentCalls;
  const ui = useMemo(() => uiWritten(messages, variant), [messages, variant]);

  return (
    <aside className="inspector">
      <div className="inspector__tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'api'} className={tab === 'api' ? 'is-active' : ''} onClick={() => setTab('api')}>
          Hotel API <span className="inspector__count">{calls.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'agui'} className={tab === 'agui' ? 'is-active' : ''} onClick={() => setTab('agui')}>
          AG-UI stream <span className="inspector__count">{events.length}</span>
        </button>
      </div>

      <div className="inspector__summary">
        UI written by the agent: <strong>{ui.bytes.toLocaleString()}</strong> bytes in {ui.count}{' '}
        {variant === 'pure' ? 'render_a2ui call(s)' : 'tool call(s)'}
      </div>

      <div className="inspector__body">
        {tab === 'api' ? <ApiCalls calls={calls} variant={variant} /> : <EventStream events={events} />}
      </div>
    </aside>
  );
}

function ApiCalls({ calls, variant }: { calls: ApiCall[]; variant: Variant }) {
  if (calls.length === 0) {
    return (
      <p className="inspector__empty">
        {variant === 'golem'
          ? 'Requests the APP sends to the hotel API show up here — exactly the contract’s request bodies.'
          : 'In the pure A2UI variant the AGENT calls the hotel API itself, through server tools, with whatever it translated from its own forms. Those calls show up here.'}
      </p>
    );
  }
  return (
    <ol className="inspector__list">
      {[...calls].reverse().map((call) => (
        <li key={call.id} className="api-call">
          <div className="api-call__line">
            <span className="api-call__method">{call.method}</span>
            <code>{call.path}</code>
            <span className={`api-call__status ${call.status && call.status >= 400 ? 'is-error' : ''}`}>{call.status ?? '…'}</span>
          </div>
          <div className="api-call__by">sent by {variant === 'golem' ? 'the app' : 'the agent (server tool)'}</div>
          <pre>{JSON.stringify(call.body, null, 2)}</pre>
          {call.response !== undefined && (
            <details>
              <summary>Response</summary>
              <pre>{JSON.stringify(call.response, null, 2)}</pre>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}

/** The pure agent's server tools, as the hotel API requests they stand for. */
const ROUTES: Record<string, { method: string; path: string }> = {
  [CHECK_AVAILABILITY_TOOL_NAME]: { method: 'POST', path: '/availability' },
  [PURE_TOOL_NAMES.quoteBooking]: { method: 'QUOTE', path: '(priced on the server)' },
  [PURE_TOOL_NAMES.createBooking]: { method: 'POST', path: '/bookings' },
  [PURE_TOOL_NAMES.updateBooking]: { method: 'PATCH', path: '/bookings/{bookingId}' },
  [PURE_TOOL_NAMES.createPayment]: { method: 'POST', path: '/payments' },
};

function serverToolCalls(messages: Message[]): ApiCall[] {
  const results = new Map(
    messages.filter((message) => message.role === 'tool').map((message) => [message.toolCallId, parse(message.content as string)]),
  );
  return messages
    .flatMap((message) => (message.role === 'assistant' ? ((message as AssistantMessage).toolCalls ?? []) : []))
    .filter((call) => ROUTES[call.function.name])
    .map((call, index) => {
      const response = results.get(call.id) as { error?: unknown } | undefined;
      return {
        id: index,
        ...ROUTES[call.function.name],
        body: parse(call.function.arguments),
        status: response === undefined ? undefined : response.error ? 422 : 200,
        response,
      };
    });
}

/** Bytes of UI the agent wrote: whole A2UI surfaces (pure) vs frontend-tool arguments (GolemUI). */
function uiWritten(messages: Message[], variant: Variant): { bytes: number; count: number } {
  const uiTools = variant === 'pure' ? new Set([RENDER_A2UI_TOOL_NAME]) : new Set(FRONTEND_TOOLS.map((tool) => tool.name));
  const calls = messages
    .flatMap((message) => (message.role === 'assistant' ? ((message as AssistantMessage).toolCalls ?? []) : []))
    .filter((call) => uiTools.has(call.function.name));
  return { bytes: calls.reduce((sum, call) => sum + new TextEncoder().encode(call.function.arguments).length, 0), count: calls.length };
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const QUIET = new Set(['TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_CHUNK', 'TOOL_CALL_ARGS', 'ACTIVITY_SNAPSHOT']);

function EventStream({ events }: { events: BaseEvent[] }) {
  if (events.length === 0) return <p className="inspector__empty">Server-sent AG-UI events from the Mastra agent appear here as they stream.</p>;

  // Collapse runs of streaming deltas into one line per run.
  const rows: Array<{ type: string; detail: string; count: number }> = [];
  for (const event of events as Array<BaseEvent & Record<string, unknown>>) {
    const previous = rows[rows.length - 1];
    if (QUIET.has(event.type) && previous?.type === event.type) {
      previous.count += 1;
      continue;
    }
    rows.push({ type: event.type, detail: detailOf(event), count: 1 });
  }

  return (
    <ol className="inspector__list inspector__list--events">
      {rows.map((row, index) => (
        <li key={index} className={`event event--${row.type.split('_')[0].toLowerCase()}`}>
          <span className="event__type">{row.type}</span>
          {row.count > 1 && <span className="event__count">×{row.count}</span>}
          {row.detail && <span className="event__detail">{row.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

function detailOf(event: BaseEvent & Record<string, unknown>): string {
  if (event.type === 'TOOL_CALL_START') return String(event.toolCallName);
  if (event.type === 'TOOL_CALL_RESULT') return String(event.content).slice(0, 60);
  if (event.type === 'ACTIVITY_SNAPSHOT') return String(event.activityType);
  if (event.type === 'RUN_FINISHED') {
    const pending = (event.outcome as { pendingToolCallIds?: string[] } | undefined)?.pendingToolCallIds;
    return pending?.length ? 'waiting for the browser' : '';
  }
  if (event.type === 'RUN_ERROR') return String(event.message);
  return '';
}
