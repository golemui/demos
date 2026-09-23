import type { PrefillResult } from './prefill';

/**
 * Shows what the model answered for each field and whether we trusted it
 * enough to write it into the form. This is the part that sells the idea:
 * the model can say "not sure", and the code decides what to do with that.
 */
export function ConfidencePanel({
  result,
  error,
}: {
  result: PrefillResult | null;
  error: string | null;
}) {
  if (error) return <div className="panel panel--error">{error}</div>;
  if (!result) {
    return (
      <div className="panel panel--empty">
        Start typing on the left. After a short pause the form fills itself in — and this
        panel shows how sure the model was about each field.
      </div>
    );
  }

  const { report, response, elapsedMs } = result;
  const usage = response.usage as { input_tokens?: number } | undefined;

  return (
    <div className="panel">
      <h2 className="panel__title">What the model decided</h2>

      <ul className="panel__rows">
        {report.map((row) => (
          <li key={row.path} className={`row ${row.value !== undefined ? 'row--filled' : 'row--skipped'}`}>
            <div className="row__head">
              <span className="row__label">{row.label}</span>
              <span className="row__badge">{row.value !== undefined ? 'filled' : 'left for you'}</span>
            </div>
            <div className="row__answer">{row.answer}</div>
            <div className="row__meter" title={`confidence ${row.confidence.toFixed(2)}`}>
              <div className="row__meter-fill" style={{ width: `${Math.round(row.confidence * 100)}%` }} />
            </div>
            {row.probabilities && (
              <div className="row__probs">
                {Object.entries(row.probabilities)
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, p]) => (
                    <span key={key}>
                      {key} <b>{Math.round(p * 100)}%</b>
                    </span>
                  ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="panel__meta">
        {response.model} · {Math.round(elapsedMs)} ms round trip · {usage?.input_tokens ?? '?'} input tokens ·{' '}
        {report.length} questions in one call
      </p>

      <details className="panel__details">
        <summary>Questions generated from the form definition</summary>
        <pre>{JSON.stringify(result.request.questions, null, 2)}</pre>
      </details>
      <details className="panel__details">
        <summary>Raw TypeSafe response</summary>
        <pre>{JSON.stringify(response.answers, null, 2)}</pre>
      </details>
    </div>
  );
}
