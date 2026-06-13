import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, FormSubmitEvent } from '@golemui/core';
import { GuiForm } from '@golemui/gui-react';
import {
  ENDPOINTS,
  DEFAULT_ENDPOINT,
  formUrl,
  type EndpointDef,
} from './endpoints';
import { buildRequest } from './lib/requestPreview';
import { wireChangeEvents, LIVE_CHANGE } from './lib/wireChangeEvents';
import { loadFormDef } from './lib/loadFormDef';
import { RequestPreview } from './widgets/RequestPreview';
import { DemoShell } from './_shared/DemoShell';

type Tab = 'spec' | 'json';
type Status = 'loading' | 'ready' | 'error';

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

export function App() {
  const [selected, setSelected] = useState<EndpointDef>(DEFAULT_ENDPOINT);
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [jsonText, setJsonText] = useState('');
  // The widget array we actually render (last successfully parsed `form`).
  const [formArray, setFormArray] = useState<unknown[] | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  // Live form data, captured from change events, used for the request preview.
  const [liveData, setLiveData] = useState<Record<string, unknown>>({});
  const [renderKey, setRenderKey] = useState(0);
  const [tab, setTab] = useState<Tab>('json');

  // Load the selected endpoint's form definition over HTTP whenever it changes.
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setLoadError(null);
    setJsonError(null);
    setPayload(null);
    setLiveData(selected.sampleData);
    setFormArray(null);

    loadFormDef(formUrl(selected.id), controller.signal)
      .then((def) => {
        setJsonText(pretty(def));
        setFormArray(def.form);
        setStatus('ready');
        setRenderKey((k) => k + 1);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });

    return () => controller.abort();
  }, [selected]);

  // Live-edit the loaded JSON. Valid JSON re-renders the form; invalid JSON
  // surfaces the parse error while the last good form stays on screen.
  function onJsonChange(text: string) {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.form)) {
        throw new Error('Expected an object with a `form` array.');
      }
      setFormArray(parsed.form);
      setJsonError(null);
      setRenderKey((k) => k + 1);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
    }
  }

  // JSON-API config: `formDef` is the parsed `{ form: [...] }` object. We render
  // a clone with `on.change` wired onto every input (see wireChangeEvents) so
  // the form emits live data via `formEvent` — the editable JSON panel keeps
  // showing the pristine, un-wired definition.
  const config = useMemo(() => {
    if (!formArray) return null;
    return {
      formDef: { form: wireChangeEvents(formArray) },
      data: selected.sampleData,
      validateOn: 'change' as const,
    };
  }, [formArray, selected]);

  const request = useMemo(
    () =>
      buildRequest(liveData, {
        method: selected.method,
        path: selected.path,
        paramStyle: selected.paramStyle,
      }),
    [liveData, selected],
  );

  function selectEndpoint(id: string) {
    const next = ENDPOINTS.find((e) => e.id === id) ?? DEFAULT_ENDPOINT;
    setSelected(next);
  }

  function handleFormEvent(event: FormEvent) {
    if (event.name === LIVE_CHANGE) setLiveData(event.data);
  }

  function handleSubmit(event: FormSubmitEvent) {
    setLiveData(event.data);
    setPayload(event.data);
  }

  return (
    <DemoShell demoName="OpenAPI playground (via MCP)">
      <div className="playground">
        <header className="pg-header">
          <h1 className="demo-title">OpenAPI → live forms</h1>
          <p className="subtitle">
            Every form below was generated from the{' '}
            <a href="https://petstore3.swagger.io/" target="_blank" rel="noreferrer">
              Petstore v3 OpenAPI spec
            </a>{' '}
            by the GolemUI MCP and saved as a JSON file. Pick an endpoint — its
            definition is fetched over HTTP, rendered, and ready to submit.
          </p>

          <div className="pg-endpoint-bar">
            <span className={`pg-badge pg-badge--${selected.method.toLowerCase()}`}>
              {selected.method}
            </span>
            <select
              className="pg-select"
              value={selected.id}
              onChange={(e) => selectEndpoint(e.target.value)}
              aria-label="OpenAPI endpoint"
            >
              {ENDPOINTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.method} {e.path} — {e.summary}
                </option>
              ))}
            </select>
          </div>

          <p className={`pg-fetch pg-fetch--${status}`} aria-live="polite">
            {status === 'loading' && <span className="pg-spinner" aria-hidden="true" />}
            {status === 'ready' && (
              <span className="material-icons pg-fetch__icon" aria-hidden="true">
                check_circle
              </span>
            )}
            {status === 'error' && (
              <span className="material-icons pg-fetch__icon" aria-hidden="true">
                error_outline
              </span>
            )}
            <span className="pg-fetch__verb">GET</span>
            <span className="pg-fetch__url">{formUrl(selected.id)}</span>
            <span className="pg-fetch__status">
              {status === 'loading' && 'loading…'}
              {status === 'ready' && '200 OK'}
              {status === 'error' && 'failed'}
            </span>
          </p>
        </header>

        <div className="pg-columns">
          <section className="pg-panel pg-source">
            <div className="pg-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'spec'}
                className={`pg-tab ${tab === 'spec' ? 'pg-tab--active' : ''}`}
                onClick={() => setTab('spec')}
              >
                OpenAPI
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'json'}
                className={`pg-tab ${tab === 'json' ? 'pg-tab--active' : ''}`}
                onClick={() => setTab('json')}
              >
                Form JSON
              </button>
            </div>

            {tab === 'spec' ? (
              <pre className="pg-code pg-spec">{selected.specSnippet}</pre>
            ) : status === 'loading' ? (
              <div className="pg-loading pg-loading--code">
                <span className="pg-spinner" aria-hidden="true" />
                Fetching form definition…
              </div>
            ) : (
              <div className="pg-json-wrap">
                <textarea
                  className="pg-json"
                  spellCheck={false}
                  value={jsonText}
                  onChange={(e) => onJsonChange(e.target.value)}
                  aria-label="Form definition JSON"
                />
                {jsonError ? (
                  <p className="pg-json-error" role="alert">
                    <span className="material-icons" aria-hidden="true">
                      error_outline
                    </span>
                    {jsonError}
                  </p>
                ) : (
                  <p className="pg-json-hint">
                    Edit and the form re-renders live — this is just JSON.
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="pg-panel pg-rendered">
            {status === 'loading' && (
              <div className="pg-loading">
                <span className="pg-spinner pg-spinner--lg" aria-hidden="true" />
                Loading the {selected.method} {selected.path} form…
              </div>
            )}
            {status === 'error' && (
              <div className="pg-loading pg-loading--error">
                <span className="material-icons" aria-hidden="true">
                  error_outline
                </span>
                {loadError}
              </div>
            )}
            {status === 'ready' && config && (
              <>
                <GuiForm
                  key={`${selected.id}-${renderKey}`}
                  config={config}
                  formEvent={handleFormEvent}
                  formSubmit={handleSubmit}
                />
                <RequestPreview request={request} />
              </>
            )}
          </section>
        </div>

        <section className="pg-panel pg-payload">
          <div className="pg-payload__bar">
            <span className="material-icons" aria-hidden="true">
              bolt
            </span>
            Captured payload
            <span className="pg-payload__hint">
              — emitted by GolemUI on submit, caught outside the form
            </span>
          </div>
          {payload ? (
            <pre className="pg-code pg-payload__code">{pretty(payload)}</pre>
          ) : (
            <p className="pg-payload__empty">
              Submit the form — the payload GolemUI emits appears here.
            </p>
          )}
        </section>
      </div>
    </DemoShell>
  );
}
