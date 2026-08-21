import type { Tool } from '@ag-ui/core';

/**
 * The generic half of the agent harness: turn ANY tool's JSON Schema into a
 * GolemUI form definition, and diff what the agent proposed against what the
 * human approved.
 *
 * This is the whole trick. A tool's `parameters` schema already tells us
 * everything an approval UI needs — field names, types, constraints, docs —
 * so instead of hand-writing one approval screen per tool, we derive it:
 *
 *   JSON Schema property          → GolemUI widget
 *   ---------------------------------------------------------------
 *   { enum: [...] }               → select (one option per value)
 *   { type: "boolean" }           → checkbox
 *   { type: "number"/"integer" }  → number
 *   { type: "string", format: "date" }        → datePicker
 *   { type: "string", maxLength >= 120 }      → textarea
 *   { type: "string" }            → textinput
 *   { type: "object" }            → recurse (nested dot-paths)
 *
 *   required / minLength / maxLength / minimum / maximum → validator rules,
 *   so the schema constrains the HUMAN's edits exactly like it constrains
 *   the agent's proposal. The schema is the policy; both sides obey it.
 *
 * Like the rest of app/agui/, this file is scenario-neutral — seed material
 * for a future `@golemui/ag-ui` package.
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** The subset of JSON Schema this converter understands. */
interface SchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  enum?: Array<string | number>;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

/** One field the human edited before approving. */
export interface HumanChange {
  path: string;
  proposed: unknown;
  approved: unknown;
}

/** What the approval surface reports back to the host. */
export type ApprovalDecision =
  | { status: 'approved'; data: Record<string, unknown>; humanChanges: HumanChange[] }
  | { status: 'rejected' };

/** A tool the harness supervises: its schema + what to run once approved. */
export interface HarnessToolEntry {
  tool: Tool;
  execute: (data: Record<string, unknown>) => unknown | Promise<unknown>;
}

export type HarnessToolRegistry = Record<string, HarnessToolEntry>;

// --------------------------------------------------------------------------
// JSON Schema -> GolemUI form definition
// --------------------------------------------------------------------------

export function schemaToFormDef(
  parameters: Record<string, unknown>,
  submitLabel = 'Approve & execute',
): Record<string, unknown> {
  const schema = parameters as SchemaProperty;
  const widgets = propertiesToWidgets(schema.properties ?? {}, schema.required ?? [], '');
  widgets.push({
    kind: 'action',
    type: 'button',
    actionType: 'submit',
    label: submitLabel,
    props: { variant: 'filled' },
  });
  return { form: widgets };
}

function propertiesToWidgets(
  properties: Record<string, SchemaProperty>,
  required: string[],
  prefix: string,
): Array<Record<string, unknown>> {
  return Object.entries(properties).flatMap(([name, property]) => {
    const path = prefix ? `${prefix}.${name}` : name;

    // Nested object -> flatten into dot-paths (GolemUI paths do the nesting).
    if (property.type === 'object' && property.properties) {
      return propertiesToWidgets(property.properties, property.required ?? [], path);
    }

    return [fieldToWidget(name, path, property, required.includes(name))];
  });
}

function fieldToWidget(
  name: string,
  path: string,
  property: SchemaProperty,
  isRequired: boolean,
): Record<string, unknown> {
  const label = property.title ?? humanize(name);
  const widget: Record<string, unknown> = { kind: 'input', path, label };
  const props: Record<string, unknown> = {};

  if (property.enum) {
    widget['type'] = 'select';
    props['options'] = property.enum.map((value) => ({ label: String(value), value }));
    props['placeholder'] = `Select ${label.toLowerCase()}`;
  } else if (property.type === 'boolean') {
    widget['type'] = 'checkbox';
  } else if (property.type === 'number' || property.type === 'integer') {
    widget['type'] = 'number';
  } else if (property.format === 'date') {
    widget['type'] = 'datePicker';
  } else if ((property.maxLength ?? 0) >= 120) {
    widget['type'] = 'textarea';
    props['autoGrow'] = true;
  } else {
    widget['type'] = 'textinput';
  }

  if (property.description && (widget['type'] === 'textinput' || widget['type'] === 'textarea')) {
    props['placeholder'] ??= property.description;
  }
  if (Object.keys(props).length > 0) widget['props'] = props;

  const validator = buildValidator(label, property, isRequired);
  if (validator) widget['validator'] = validator;

  return widget;
}

function buildValidator(
  label: string,
  property: SchemaProperty,
  isRequired: boolean,
): Record<string, unknown> | null {
  const type =
    property.type === 'number' || property.type === 'integer'
      ? 'number'
      : property.type === 'boolean'
        ? 'boolean'
        : 'string';

  const validator: Record<string, unknown> = { type };
  const messages: Record<string, string> = {};

  if (isRequired) {
    validator['required'] = true;
    // An untouched empty field reports "invalid", not "required" — set both.
    messages['required'] = `${label} is required`;
    messages['invalid'] = `${label} is required`;
  }
  if (property.minLength !== undefined) {
    validator['minLength'] = property.minLength;
    messages['minLength'] = `${label} must be at least ${property.minLength} characters`;
  }
  if (property.maxLength !== undefined) {
    validator['maxLength'] = property.maxLength;
    messages['maxLength'] = `${label} must be at most ${property.maxLength} characters`;
  }
  if (property.minimum !== undefined) {
    validator['minimum'] = property.minimum;
    messages['minimum'] = `${label} must be at least ${property.minimum}`;
  }
  if (property.maximum !== undefined) {
    validator['maximum'] = property.maximum;
    messages['maximum'] = `${label} must be at most ${property.maximum}`;
  }

  if (Object.keys(validator).length === 1) return null; // only "type" — nothing to enforce
  validator['messages'] = messages;
  return validator;
}

function humanize(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

// --------------------------------------------------------------------------
// Proposal diff — what did the human change before approving?
// --------------------------------------------------------------------------

/**
 * Compares the agent's proposed arguments with what the human submitted and
 * returns the fields that differ. Sending this diff back with the tool result
 * is the harness's feedback loop: the agent learns how its proposal was
 * corrected, not just that it was accepted.
 */
export function diffProposal(
  proposed: Record<string, unknown>,
  approved: Record<string, unknown>,
): HumanChange[] {
  const proposedFlat = flatten(proposed);
  const approvedFlat = flatten(approved);
  const paths = new Set([...Object.keys(proposedFlat), ...Object.keys(approvedFlat)]);

  const changes: HumanChange[] = [];
  for (const path of paths) {
    if (proposedFlat[path] !== approvedFlat[path]) {
      changes.push({ path, proposed: proposedFlat[path], approved: approvedFlat[path] });
    }
  }
  return changes;
}

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      Object.assign(flat, flatten(entry as Record<string, unknown>, path));
    } else {
      flat[path] = entry;
    }
  }
  return flat;
}
