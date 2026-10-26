import createBookingForm from '../forms/createBooking.json' with { type: 'json' };
import updateBookingForm from '../forms/updateBooking.json' with { type: 'json' };
import type { AskableOperation } from './hotel-api';
import { isGroup, requestSchema } from './contract';
import { today } from './pricing';

/**
 * Run-time half of "forms from the contract".
 *
 * The full form of each operation was generated from the OpenAPI at build time
 * (`npm run forms`). Here we only SLICE it: the agent names an operation and the
 * fields it still needs, and we keep exactly those widgets. The agent decides
 * WHAT to ask; how each field looks and validates was decided by the contract.
 *
 * Fields are addressed like the request body: a top-level field ("guests",
 * "dates") or a sub-field of an optional group ("specialRequests.babyCrib").
 */

type Widget = {
  kind: string;
  type: string;
  path?: string;
  label?: string;
  uid?: string;
  props?: Record<string, unknown>;
  on?: Record<string, string>;
  children?: Widget[];
  [key: string]: unknown;
};

export interface FormDefinition {
  form: Widget[];
  [key: string]: unknown;
}

const GENERATED: Record<AskableOperation, FormDefinition> = {
  createBooking: createBookingForm as FormDefinition,
  updateBooking: updateBookingForm as FormDefinition,
};

/** Form event every input emits on change, so the host can recompute live summaries. */
export const CHANGED_EVENT = '__changed';
/** Form event of the booking date pickers (the host caps departure at 30 nights). */
export const DATES_CHANGED_EVENT = 'datesChanged';

export interface FormRequest {
  operation: AskableOperation;
  /** Fields to ask for ("guests", "dates", "specialRequests.parking"…). Omitted or empty = everything. */
  fields?: string[];
  submitLabel?: string;
}

export function formForOperation({ operation, fields, submitLabel }: FormRequest): FormDefinition {
  const generated = GENERATED[operation];
  if (!generated) throw new Error(`Unknown operation "${operation}"`);

  const wanted = fields && fields.length > 0 ? fields : null;
  const form = structuredClone(generated.form)
    .map((widget) => slice(widget, wanted))
    .filter((widget): widget is Widget => widget !== null)
    .map((widget) => wire(widget, operation))
    .map((widget) => titleGroup(widget, operation));

  if (submitLabel) {
    const submit = form.find((widget) => widget.kind === 'action');
    if (submit) submit.label = submitLabel;
  }
  return { ...generated, form };
}

/** Keeps the inputs that were asked for; drops layouts left empty. */
function slice(widget: Widget, wanted: string[] | null): Widget | null {
  if (widget.children) {
    const children = widget.children.map((child) => slice(child, wanted)).filter((c): c is Widget => c !== null);
    return children.length > 0 ? { ...widget, children } : null;
  }
  if (widget.kind !== 'input' || !wanted) return widget;
  const path = widget.path ?? '';
  return wanted.some((field) => path === field || path.startsWith(`${field}.`)) ? widget : null;
}

/**
 * Attaches the run-time bits a build-time file can't hold: change events for
 * the host, and the date pickers' "not before today" floor.
 */
function wire(widget: Widget, operation: AskableOperation): Widget {
  if (widget.children) return { ...widget, children: widget.children.map((child) => wire(child, operation)) };
  if (widget.kind !== 'input') return widget;

  if (fieldOf(widget.path) === 'dates') {
    return { ...widget, props: { ...widget.props, minDate: today() }, on: { change: DATES_CHANGED_EVENT } };
  }
  return { ...widget, on: { change: CHANGED_EVENT } };
}

/**
 * The generator renders an optional group (e.g. specialRequests) as an untitled
 * layout. Give it a visible section — titled from the contract — so the guest
 * sees where these answers belong.
 */
function titleGroup(widget: Widget, operation: AskableOperation): Widget {
  if (widget.kind !== 'layout' || !widget.children) return widget;
  const fields = new Set(widget.children.map((child) => fieldOf(child.path)));
  if (fields.size !== 1) return widget;
  const [field] = fields;
  const group = requestSchema(operation).properties?.[field];
  if (!group || !isGroup(group)) return widget;

  return {
    kind: 'layout',
    type: 'accordion',
    props: { sections: [{ uid: field, label: group.title ?? field }], defaultOpen: { [field]: true } },
    children: [{ ...widget, uid: field }],
  };
}

function fieldOf(path?: string): string {
  return (path ?? '').split('.')[0];
}

