import type { DisplayWidget, WithWidget } from '@golemui/core';
import { useDisplayWidget } from '@golemui/react';
import story from '../story.json';

/**
 * The live checklist under the summary: one row per key fact of the story.
 *
 * It is a plain display widget. It knows nothing about TypeSafe: the app puts
 * each fact's status into the form's meta (`setMeta({ rubric: {...} })`) and the
 * definition hands it over through interpolated props such as
 * `"hungry": "{{$meta.rubric?.hungry ?? ''}}"`.
 */
export function Rubric(widgetInstance: WithWidget) {
  const widget = widgetInstance.widget as DisplayWidget<string>;
  const { uid, templateData } = useDisplayWidget<Record<string, string>>(widget);

  const facts = Object.entries(story.facts);
  const covered = facts.filter(([id]) => templateData[id] === 'covered').length;
  const started = facts.some(([id]) => templateData[id]);

  return (
    <div className="rubric" style={{ flex: templateData.size }} id={uid}>
      <div className="rubric__head">
        <span>Key events in your summary</span>
        {started && <span className="rubric__count">{covered} / {facts.length}</span>}
      </div>
      <ul className="rubric__list">
        {facts.map(([id, fact]) => {
          const status = templateData[id] || 'pending';
          return (
            <li key={id} className={`rubric__fact rubric__fact--${status}`}>
              <span className="rubric__mark" aria-hidden="true">
                {status === 'covered' ? '✓' : status === 'unclear' ? '?' : '·'}
              </span>
              {fact}
            </li>
          );
        })}
      </ul>
      {templateData.completeness && (
        <p className="rubric__note">{templateData.completeness}</p>
      )}
    </div>
  );
}
