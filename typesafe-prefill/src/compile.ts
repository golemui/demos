/**
 * Definition → questions.
 *
 * This is the heart of the demo. It walks a GolemUI JSON form definition and
 * turns every input widget into one TypeSafe question. There is no prompt
 * anywhere: the widget's label becomes the question, and its options become
 * the closed set of answers the model is allowed to pick from.
 *
 *   select / radiogroup  →  Choice  (criteria = the widget's options)
 *   radiogroup in hints.scales →  Score  (criteria = the options, in order)
 *   checkbox             →  Noul    (probability that the label is true)
 *   textinput            →  Choice  over candidate spans found in the text by
 *                           the widget's own validator (`format: "email"` or
 *                           `pattern`). The model picks one; code copies it.
 *   textarea             →  skipped (free text cannot be "selected")
 */

// The subset of the GolemUI JSON widget shape this demo reads
// (the index signatures let the rest of the definition through untouched).
export interface Widget {
  kind: string;
  type: string;
  path?: string;
  label?: string;
  children?: Widget[];
  props?: { options?: Option[]; [key: string]: unknown };
  validator?: { format?: string; pattern?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * The one thing the definition cannot tell us: whether a radiogroup's options
 * are an ordered scale (→ Score) or unrelated alternatives (→ Choice).
 * GolemUI's JSON schema rejects unknown keys, so this lives beside the form.
 */
export interface Hints {
  scales?: string[]; // paths of radiogroups whose options go from "least" to "most"
}

export interface Option {
  value: string;
  label: string;
}

// The three TypeSafe question shapes, exactly as the HTTP API expects them.
export type Question =
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'noul'; instructions: string };

/** A question plus what we need to map its answer back onto the widget. */
export interface Field {
  path: string;
  label: string;
  kind: 'choice' | 'scale' | 'boolean' | 'text';
  question: Question;
  /** For `scale`: the options in order, so score N maps to options[N]. */
  options?: Option[];
}

/** The escape hatch on every Choice: "the message does not say". */
export const NONE = 'none';

// Candidate finders for text inputs. The email one is generic; anything else
// comes straight from the widget's `pattern` validator.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function compile(definition: { form: Widget[] }, text: string, hints: Hints = {}): Field[] {
  const fields: Field[] = [];
  for (const widget of inputsOf(definition.form)) {
    const field = toField(widget, text, hints);
    if (field) fields.push(field);
  }
  return fields;
}

/** Flattens layouts so we get every input widget, wherever it is nested. */
function inputsOf(widgets: Widget[]): Widget[] {
  return widgets.flatMap((w) => {
    if (w.children) return inputsOf(w.children);
    return w.kind === 'input' && w.path ? [w] : [];
  });
}

function toField(widget: Widget, text: string, hints: Hints): Field | null {
  const { path = '', label = path } = widget;

  switch (widget.type) {
    case 'select':
    case 'radiogroup':
    case 'dropdown': {
      const options = widget.props?.options ?? [];

      if (hints.scales?.includes(path)) {
        return {
          path, label, kind: 'scale', options,
          question: {
            type: 'score',
            instructions: `Based on \`message\`, rate "${label}".`,
            criteria: options.map((o) => o.label),
          },
        };
      }

      return {
        path, label, kind: 'choice',
        question: {
          type: 'choice',
          instructions: `Based on \`message\`, what is the customer's answer to "${label}"?`,
          criteria: {
            ...Object.fromEntries(options.map((o) => [o.value, o.label])),
            [NONE]: 'The message does not say',
          },
        },
      };
    }

    case 'checkbox':
    case 'toggle':
      return {
        path, label, kind: 'boolean',
        question: {
          type: 'noul',
          instructions: `Based on \`message\`, is this true: "${label}"?`,
        },
      };

    case 'textinput': {
      const candidates = findCandidates(widget, text);
      if (candidates.length === 0) return null; // nothing to choose from yet

      return {
        path, label, kind: 'text',
        question: {
          type: 'choice',
          instructions: `Which of these is the "${label}" the customer means in \`message\`?`,
          criteria: {
            ...Object.fromEntries(candidates.map((c) => [c, null])),
            [NONE]: 'None of them',
          },
        },
      };
    }

    default:
      return null; // textarea and anything we don't know how to fill
  }
}

/**
 * Finds the strings in the text that could be this widget's value, using the
 * widget's own validator. Whatever the model picks is one of these, verbatim.
 */
function findCandidates(widget: Widget, text: string): string[] {
  const { format, pattern } = widget.validator ?? {};
  let finder: RegExp | undefined;
  if (format === 'email') finder = EMAIL;
  else if (pattern) finder = new RegExp(pattern.replace(/^\^|\$$/g, ''), 'g');
  if (!finder) return [];

  return [...new Set(text.match(finder) ?? [])];
}
