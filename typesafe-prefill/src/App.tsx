import { useEffect, useRef, useState } from 'react';
import { GuiForm } from '@golemui/gui-react';
import type { FormComponentHandle } from '@golemui/react';
import type { FormEvent, FormSubmitEvent } from '@golemui/core';
import type { GuiFormInitConfig } from '@golemui/gui-shared';
import claimForm from './claim-form.json';
import { prefill, type PrefillResult } from './prefill';
import { ConfidencePanel } from './ConfidencePanel';
import { DemoShell } from './_shared/DemoShell';

const MIN_CHARS = 15; // don't bother the model with "hi"
const DEBOUNCE_MS = 400; // wait for a pause in typing

const SAMPLE =
  'Hi, order A-104 arrived yesterday and the coffee maker has a broken handle, it looks like it was badly packed. ' +
  'I want my money back, and I need this sorted before Friday. Please write to raul.personal@gmail.com, not my work address raul@acme-corp.com.';

// Module scope: a new config identity would re-initialise the form on every render.
const config: GuiFormInitConfig = { formDef: claimForm };

// "Condition of the product" is an ordered scale, so it becomes a Score question.
const AI_HINTS = { scales: ['condition'] };

export default function App() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<PrefillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  const formRef = useRef<FormComponentHandle>(null);
  const formData = useRef<Record<string, unknown>>({}); // latest form data (from the `changed` event)
  const aiValues = useRef<Record<string, unknown>>({}); // what prefill wrote last time
  const runId = useRef(0); // ignore responses that arrive out of order

  // Debounce: run one prefill DEBOUNCE_MS after the last keystroke.
  useEffect(() => {
    if (text.trim().length < MIN_CHARS) return;
    const timer = setTimeout(() => run(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  async function run(message: string) {
    const id = ++runId.current;
    try {
      const next = await prefill(claimForm, message, AI_HINTS);
      if (id !== runId.current) return; // a newer request is already in flight

      // Merge rule: never overwrite something the person typed by hand.
      // A field is "theirs" when it has a value that we did not put there.
      const data = { ...formData.current };
      for (const [path, value] of Object.entries(next.values)) {
        const current = data[path];
        const ownedByHuman = current !== undefined && current !== '' && current !== aiValues.current[path];
        if (!ownedByHuman) {
          data[path] = value;
          aiValues.current[path] = value;
        }
      }
      formData.current = data;
      formRef.current?.setData(data);

      setResult(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleFormEvent(event: FormEvent) {
    if (event.name === 'changed') formData.current = event.data;
  }

  function reset() {
    runId.current++;
    formData.current = {};
    aiValues.current = {};
    formRef.current?.setData({});
    setText('');
    setResult(null);
    setSubmitted(null);
  }

  return (
    <DemoShell demoName="Prefill from free text">
      <div className="prefill">
        <section className="prefill__left">
          <label className="prefill__label" htmlFor="message">
            Tell us what happened
          </label>
          <textarea
            id="message"
            className="prefill__message"
            value={text}
            placeholder="Paste an email or describe the problem in your own words…"
            onChange={(e) => setText(e.target.value)}
          />
          <div className="prefill__toolbar">
            <button type="button" onClick={() => setText(SAMPLE)}>
              Use sample text
            </button>
            <button type="button" onClick={reset}>
              Reset
            </button>
          </div>

          <div className="prefill__form">
            <GuiForm
              ref={formRef}
              config={config}
              formEvent={handleFormEvent}
              formSubmit={(e: FormSubmitEvent) => setSubmitted(e.data)}
            />
          </div>

          {submitted && (
            <pre className="prefill__submitted">{JSON.stringify(submitted, null, 2)}</pre>
          )}
        </section>

        <aside className="prefill__right">
          <ConfidencePanel result={result} error={error} />
        </aside>
      </div>
    </DemoShell>
  );
}
