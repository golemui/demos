import { useState } from 'react';
import type { BaseEvent } from '@ag-ui/core';
import { useAgent, type AgentStore } from '../agui/agentStore';
import { useApiLog, type ApiCall } from '../api/hotelApi';

/**
 * What happens behind the chat: what actually reached the hotel API, and the
 * raw AG-UI event stream from the agent.
 */
export function Inspector({ store }: { store: AgentStore }) {
  const [tab, setTab] = useState<'api' | 'agui'>('api');
  const calls = useApiLog();
  const { events } = useAgent(store);

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

      <div className="inspector__body">
        {tab === 'api' ? <ApiCalls calls={calls} /> : <EventStream events={events} />}
      </div>
    </aside>
  );
}

function ApiCalls({ calls }: { calls: ApiCall[] }) {
  if (calls.length === 0) {
    return (
      <p className="inspector__empty">
        Requests the APP sends to the hotel API show up here — exactly the contract’s request bodies. The agent never
        calls it to book or to pay.
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
