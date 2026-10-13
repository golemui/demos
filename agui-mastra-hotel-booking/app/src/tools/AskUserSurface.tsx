import { useMemo } from 'react';
import { GuiForm } from '@golemui/gui-react';
import type { FormEvent, FormSubmitEvent } from '@golemui/core';
import { formForOperation, type AskableOperation } from '@hotel/shared';
import type { ToolSurfaceProps } from '../agui/toolSurfaces';
import { handleBookingFormEvent } from '../booking/bookingFormEvents';
import { fieldLabel, getPath, pickPaths, valueLabel } from './contractLabels';

export interface AskUserArgs {
  operation: AskableOperation;
  fields: string[];
  prefill?: Record<string, unknown>;
  intro?: string;
  submitLabel?: string;
}

/**
 * `ask_user` — the agent says WHICH operation and WHICH fields; the form itself
 * is the contract-generated one, sliced to those fields. The submitted data is
 * already in the API's shape, so it goes back to the agent as-is.
 */
export function AskUserSurface({ toolCallId, args, result, respond }: ToolSurfaceProps<AskUserArgs>) {
  const { operation, fields, prefill, intro, submitLabel } = args;

  const config = useMemo(
    () => ({
      formDef: formForOperation({ operation, fields, submitLabel: submitLabel ?? 'Continue' }),
      data: structuredClone(prefill ?? {}),
      formName: `ask-${toolCallId}`,
    }),
    [operation, fields, prefill, submitLabel, toolCallId],
  );

  function onSubmit(event: FormSubmitEvent) {
    // Answer with exactly the fields that were asked, in the API's (nested) shape.
    respond(pickPaths(event.data, fields));
  }

  function onFormEvent(event: FormEvent) {
    if (operation === 'createBooking') handleBookingFormEvent(event);
  }

  return (
    <div className="surface">
      <div className="surface__header">
        <span className="surface__badge">ask_user</span>
        <code className="surface__meta">
          {operation}({fields.join(', ')})
        </code>
      </div>
      {result !== undefined ? (
        <dl className="surface__answers">
          {fields.map((field) => (
            <div key={field}>
              <dt>{fieldLabel(operation, field)}</dt>
              <dd>{valueLabel(operation, field, getPath(result, field))}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <>
          {intro && <p className="surface__intro">{intro}</p>}
          <GuiForm config={config} formSubmit={onSubmit} formEvent={onFormEvent} />
        </>
      )}
    </div>
  );
}
