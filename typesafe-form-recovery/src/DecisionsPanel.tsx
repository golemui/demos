import type { RecoverResult } from './recover';

/** One row per span of the input: what the model decided and how sure it was. */
export function DecisionsPanel({ result }: { result: RecoverResult }) {
  const { decisions, questionCount, elapsedMs, model, inputTokens, validation } = result;

  return (
    <div className="decisions">
      <p className="decisions__meta">
        {questionCount} questions in two calls (catalog, then fields) · {Math.round(elapsedMs)} ms · {inputTokens} input
        tokens · {model}
      </p>

      <table className="decisions__table">
        <thead>
          <tr>
            <th>span</th>
            <th>role</th>
            <th>widget</th>
            <th>req.</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => (
            <tr key={d.id} className={d.role === 'field' ? 'is-field' : ''}>
              <td className="decisions__text" title={d.text}>
                {d.text}
              </td>
              <td>
                {d.role} <Conf value={d.roleConfidence} />
              </td>
              <td>
                {d.widget && (
                  <>
                    {d.widget} <Conf value={d.widgetConfidence} />
                    {d.options && <div className="decisions__options">{d.options.join(' · ')}</div>}
                  </>
                )}
              </td>
              <td>{d.required !== undefined && `${Math.round(d.required * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {!validation.valid && (
        <ul className="decisions__errors">
          {validation.errors.map((e, i) => (
            <li key={i}>
              <code>{e.path}</code> {e.message}
            </li>
          ))}
        </ul>
      )}

      <details className="decisions__details">
        <summary>Raw requests and responses</summary>
        <pre>{JSON.stringify({ requests: result.requests, responses: result.responses }, null, 2)}</pre>
      </details>
    </div>
  );
}

function Conf({ value }: { value?: number }) {
  if (value === undefined) return null;
  const level = value >= 0.8 ? 'high' : value >= 0.5 ? 'mid' : 'low';
  return <span className={`conf conf--${level}`}>{value.toFixed(2)}</span>;
}
