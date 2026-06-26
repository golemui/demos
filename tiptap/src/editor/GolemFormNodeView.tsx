import { useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { FormEvent, FormSubmitEvent } from '@golemui/core';
import type { GuiFormInitConfig } from '@golemui/gui-shared';
import { GuiForm } from '@golemui/gui-react';
import { FormErrorBoundary } from './FormErrorBoundary';
import { LIVE_CHANGE, wireChangeEvents } from './wireChangeEvents';
import type { FormDef } from './templates';

/**
 * React node view for the `golemForm` node. It mounts a live `<GuiForm>` and
 * mirrors what the user types back into the node's attributes, so the document
 * JSON (`editor.getJSON()`) always contains both the form definition *and* its
 * captured values — prose + forms + data in one serializable tree.
 */
export function GolemFormNodeView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, selected, editor } = props;
  const formDef = node.attrs.formDef as FormDef;
  const formId = node.attrs.formId as string;
  const editable = editor.isEditable;

  const [submitted, setSubmitted] = useState(false);

  // Capture the persisted values ONCE, at mount, as the form's seed data. After
  // that the live `<GuiForm>` owns its own state — we never feed values back in
  // (that would fight the inputs and steal the caret). We only read values OUT,
  // via the wired change events, and store them on the node for serialization.
  const seedData = useRef(node.attrs.value ?? undefined).current;

  // Render a clone of the definition with `on.change` wired onto every input,
  // so GolemUI emits `formEvent` on each keystroke. The pristine definition
  // stays untouched on `node.attrs.formDef` for the JSON panel.
  const config = useMemo<GuiFormInitConfig>(
    () => ({
      formDef: { ...formDef, form: wireChangeEvents(formDef.form ?? []) },
      data: seedData,
      validateOn: 'eager',
    }),
    [formDef, seedData],
  );

  function handleEvent(event: FormEvent) {
    if (event.name === LIVE_CHANGE) {
      updateAttributes({ value: event.data });
      if (submitted) setSubmitted(false);
    }
  }

  function handleSubmit(event: FormSubmitEvent) {
    updateAttributes({ value: event.data });
    setSubmitted(true);
  }

  return (
    <NodeViewWrapper
      className={`gfb${selected ? ' gfb--selected' : ''}`}
      contentEditable={false}
      data-form-id={formId}
    >
      <div className="gfb__bar">
        {editable && (
          <span
            className="gfb__handle material-icons"
            data-drag-handle
            draggable="true"
            contentEditable={false}
            title="Drag to move"
            aria-label="Drag to move this form"
          >
            drag_indicator
          </span>
        )}
        <span className="gfb__label">
          <span className="material-icons" aria-hidden="true">
            dynamic_form
          </span>
          golemForm
        </span>
        <span className="gfb__id">{formId?.slice(0, 8)}</span>
        {submitted && (
          <span className="gfb__submitted">
            <span className="material-icons" aria-hidden="true">
              check_circle
            </span>
            submitted
          </span>
        )}
        {editable && (
          <button
            type="button"
            className="gfb__delete"
            onClick={() => deleteNode()}
            title="Delete form"
            aria-label="Delete this form"
          >
            <span className="material-icons" aria-hidden="true">
              delete
            </span>
          </button>
        )}
      </div>

      <div className="gfb__body">
        <FormErrorBoundary>
          <GuiForm
            key={formId}
            config={config}
            formEvent={handleEvent}
            formSubmit={handleSubmit}
          />
        </FormErrorBoundary>
      </div>
    </NodeViewWrapper>
  );
}
