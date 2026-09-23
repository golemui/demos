/**
 * Answers → GolemUI JSON definition.
 *
 * Nothing here is clever: it reads the picks TypeSafe made for each field
 * span and writes the widget the GolemUI JSON API expects. The label is the
 * span's text, verbatim; the path is a slug of it; the validator type follows
 * from the widget. Every key comes from code, so the result is valid by
 * construction (recover.ts double-checks with the same validator the GolemUI
 * MCP server uses).
 */
import { NONE, spansAfter, type Span } from './questions.ts';

// Threshold for the yes/no answers.
const YES = 0.7;

export interface SpanDecision {
  id: string;
  text: string;
  role: string;
  roleConfidence: number;
  // Only for spans that came back as fields:
  widget?: string;
  widgetConfidence?: number;
  required?: number;
  options?: string[];
}

export interface Recovered {
  definition: { $schema: string; form: unknown[] };
  decisions: SpanDecision[];
}

type Answers = Record<string, any>;

export function assemble(spans: Span[], catalog: Answers, described: Answers): Recovered {
  const roles = Object.fromEntries(spans.map((s) => [s.id, catalog[`${s.id}.role`].choice]));
  const decisions: SpanDecision[] = spans.map((s) => ({
    id: s.id, text: s.text, role: roles[s.id], roleConfidence: catalog[`${s.id}.role`].confidence,
  }));

  const form: any[] = [];
  let lastField: any = null;

  for (const span of spans) {
    const decision = decisions.find((d) => d.id === span.id)!;

    // A hint attaches to the previous field; intro/attribute/option/other produce nothing on their own.
    if (roles[span.id] === 'hint' && lastField) {
      // A hint may arrive in several spans (a sentence split at its commas): join them.
      const hint = [lastField.props?.hint, span.text].filter(Boolean).join(', ');
      lastField.props = { ...lastField.props, hint };
      continue;
    }
    if (roles[span.id] !== 'field') continue;

    const a = (key: string) => described[`${span.id}.${key}`];
    const required = a('required').noul >= YES;
    const min = pickNumber(a('min'));
    const max = pickNumber(a('max'));
    const options = spansAfter(spans, roles, span)
      .filter((s) => roles[s.id] === 'option' && (a(`opt.${s.id}`)?.noul ?? 0) >= YES)
      .map((s) => s.text);

    let type: string = a('widget').choice;
    // Choice widgets need options; without them, fall back to free text.
    if (['radiogroup', 'select', 'multiList'].includes(type) && options.length < 2) type = 'textinput';
    // "Several options" wins over the widget guess when there are options.
    if (options.length >= 2 && a('multiple').noul >= YES) type = 'multiList';

    Object.assign(decision, { widget: type, widgetConfidence: a('widget').confidence, required: a('required').noul });
    if (['radiogroup', 'select', 'multiList'].includes(type)) decision.options = options;

    const field: any = { kind: 'input', type, path: slug(span.text), label: span.text };

    switch (type) {
      case 'textinput':
      case 'textarea':
      case 'password':
        field.validator = compact({
          type: 'string', required,
          format: a('email').noul >= YES ? 'email' : undefined,
          minLength: min, maxLength: max,
        });
        break;
      case 'number':
      case 'currency':
        field.validator = compact({ type: 'number', required, minimum: min, maximum: max });
        break;
      case 'datePicker':
        field.validator = compact({ type: 'string', required, format: 'date' });
        break;
      case 'checkbox':
        // A mandatory checkbox must be checked: `required` alone accepts `false`.
        if (required) field.validator = { type: 'boolean', required: true, const: true };
        break;
      case 'radiogroup':
      case 'select':
        field.props = { options: options.map((o) => ({ value: slug(o), label: o })) };
        field.validator = compact({ type: 'string', required });
        break;
      case 'multiList':
        field.props = { items: options.map((o) => ({ value: slug(o), label: o })) };
        field.validator = compact({ type: 'array', required, minItems: min, maxItems: max });
        break;
      case 'tags':
        field.validator = compact({ type: 'array', required, minItems: min, maxItems: max });
        break;
    }

    form.push(field);
    lastField = field;
  }

  form.push({ kind: 'action', type: 'button', label: 'Submit', actionType: 'submit' });
  return { definition: { $schema: 'https://golemui.com/schemas/form.schema.json', form }, decisions };
}

function pickNumber(answer: any): number | undefined {
  if (!answer || answer.choice === NONE) return undefined;
  return Number(answer.choice);
}

/** "Subscribe to newsletter" → "subscribeToNewsletter" */
function slug(text: string): string {
  const words = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  return words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('') || 'field';
}

/** Drops undefined and false values so the JSON stays tidy. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== false)) as Partial<T>;
}
