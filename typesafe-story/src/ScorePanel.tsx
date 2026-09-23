import type { Assessment } from './rubric';

/**
 * The lesson score: a deterministic part (the quiz) and a model-assisted part
 * (the summary). Both numbers are computed in code — the model only supplies
 * probabilities, which you can inspect at the bottom.
 */
export function ScorePanel({
  quiz,
  assessment,
  error,
  finished,
}: {
  quiz: { correct: number; total: number };
  assessment: Assessment | null;
  error: string | null;
  finished: boolean;
}) {
  const quizScore = Math.round((100 * quiz.correct) / quiz.total);
  const summaryScore = assessment?.score ?? 0;
  const total = Math.round((quizScore + summaryScore) / 2);

  return (
    <div className="panel">
      <h2 className="panel__title">{finished ? 'Lesson complete!' : 'Lesson score'}</h2>

      <div className="score">
        <div className="score__total">{total}</div>
        <div className="score__parts">
          <div>
            Quiz <b>{quiz.correct}</b> / {quiz.total} correct
          </div>
          <div>
            Summary <b>{assessment ? summaryScore : '–'}</b> / 100
          </div>
        </div>
      </div>

      {error && <p className="panel__error">{error}</p>}

      {assessment && (
        <>
          <ul className="signals">
            {Object.entries(assessment.facts).map(([id, fact]) => (
              <li key={id} className={`signal signal--${fact.status}`}>
                <span className="signal__label">{id.replace('_', ' ')}</span>
                <span className="signal__bar">
                  <span style={{ width: `${Math.round(fact.p * 100)}%` }} />
                </span>
                <span className="signal__value">{Math.round(fact.p * 100)}%</span>
              </li>
            ))}
            <li className="signal">
              <span className="signal__label">completeness</span>
              <span className="signal__bar">
                <span style={{ width: `${Math.round((assessment.completeness.score / 3) * 100)}%` }} />
              </span>
              <span className="signal__value">
                {assessment.completeness.score.toFixed(1)} / 3 (conf {assessment.completeness.confidence.toFixed(2)})
              </span>
            </li>
            <li className="signal">
              <span className="signal__label">contradicts</span>
              <span className="signal__bar">
                <span style={{ width: `${Math.round(assessment.contradicts * 100)}%` }} />
              </span>
              <span className="signal__value">{Math.round(assessment.contradicts * 100)}%</span>
            </li>
            <li className="signal">
              <span className="signal__label">in Spanish</span>
              <span className="signal__bar">
                <span style={{ width: `${Math.round(assessment.spanish * 100)}%` }} />
              </span>
              <span className="signal__value">{Math.round(assessment.spanish * 100)}%</span>
            </li>
          </ul>

          <p className="panel__meta">
            {Object.keys(assessment.facts).length + 4} questions in one call · {Math.round(assessment.elapsedMs)} ms
          </p>
          <details className="panel__details">
            <summary>Raw TypeSafe response</summary>
            <pre>{JSON.stringify(assessment.raw, null, 2)}</pre>
          </details>
        </>
      )}

      {!assessment && !error && (
        <p className="panel__hint">
          Read the story, answer the questions, then write your summary. The summary is checked
          against the story as you type.
        </p>
      )}
    </div>
  );
}
