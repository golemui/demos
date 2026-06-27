import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

/**
 * Live render of `editor.getJSON()` beside the editor. As you type prose, insert
 * forms, and fill them in, this tree updates — showing that prose nodes,
 * `golemForm` nodes (with their `formDef`) and the captured `value` are all one
 * serializable document. This is the demo's hero panel.
 */
export function ViewJsonPanel({ editor }: { editor: Editor }) {
  const [json, setJson] = useState(() => pretty(editor.getJSON()));

  useEffect(() => {
    const update = () => setJson(pretty(editor.getJSON()));
    update();
    editor.on('update', update);
    editor.on('selectionUpdate', update);
    return () => {
      editor.off('update', update);
      editor.off('selectionUpdate', update);
    };
  }, [editor]);

  const formCount = (json.match(/"type":\s*"golemForm"/g) ?? []).length;

  return (
    <section className="json-panel">
      <header className="json-panel__head">
        <span className="material-icons" aria-hidden="true">
          data_object
        </span>
        <span className="json-panel__title">editor.getJSON()</span>
        <span className="json-panel__badge">
          {formCount} {formCount === 1 ? 'form' : 'forms'}
        </span>
      </header>
      <p className="json-panel__hint">
        The whole document — prose, <code>golemForm</code> nodes and the values
        you type into them — is one serializable tree. Store it, diff it, ship it.
      </p>
      <pre className="json-panel__code">{json}</pre>
    </section>
  );
}
