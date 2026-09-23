/**
 * Text → questions, in two passes.
 *
 * Structure recovery, GolemUI edition. Code cuts the text into small spans
 * (lines, then commas, "and"/"or", colons…) and tags each one with an id:
 *
 *   S000| I need a form with three fields
 *   S001| name
 *   S002| surname
 *   S003| age
 *
 * Pass 1 — catalog. One Choice per span: is it a FIELD, an ATTRIBUTE of a
 * field (type, validation, constraint), an OPTION a field offers, a HINT, the
 * INTRO, or noise? The fields only exist once this pass has answered.
 *
 * Pass 2 — describe. For each span that came back as a field: which widget,
 * is it required, is it an email, may several options be chosen, which of the
 * numbers nearby is a min/max, and which of the option spans that follow it
 * belong to it. The span's own text is the label, verbatim.
 *
 * Both passes see the whole text, so "name, surname and age" on one line
 * works as well as one field per line. The model never writes JSON.
 */

export const NONE = 'none';

/** GolemUI widget types the recovery can produce, with a one-line rubric each. */
export const WIDGETS: Record<string, string> = {
  textinput: 'a single-line text input (names, emails, short answers)',
  textarea: 'a multi-line text area (bios, comments, descriptions)',
  password: 'a password input',
  number: 'a numeric input',
  currency: 'a money amount',
  datePicker: 'a date',
  checkbox: 'a single yes/no checkbox (consent, opt-in)',
  radiogroup: 'pick exactly one of a few listed options',
  select: 'pick exactly one option from a dropdown',
  multiList: 'pick several of the listed options',
  tags: 'a free-form list of words the user types',
};

export const ROLES = {
  field: 'It names a form field to create',
  attribute: 'It describes a type, validation or constraint of a field (e.g. "type text", "required", "max 120 chars")',
  option: 'It is one of the choices a field offers (e.g. "beginner", "Google")',
  hint: 'It is a note or help text about a field',
  intro: 'It introduces the form, gives it a title, or says how many fields there are',
  other: 'Anything else',
};

export interface Span {
  id: string;
  text: string;
  /** Index of the line the span came from (spans on the same line belong together). */
  line: number;
}

// Direct evidence stays in code: a pure numbering marker is never a field.
const NUMBERING = /^(?:field|campo|question|pregunta|item|q|#)?\s*\d+$/i;

export function splitSpans(text: string): Span[] {
  const spans: Span[] = [];
  text.split('\n').forEach((raw, line) => {
    const clean = raw.replace(/^[\s*\-•]+/, '').trim(); // drop bullets
    if (!clean) return;
    for (const piece of clean.split(/[,;:()\[\]?¿!¡]|\s[-–—]\s|\s(?:and|or|y|e|o|u)\s/i)) {
      const t = piece.replace(/[.]+$/, '').trim();
      if (!t || NUMBERING.test(t)) continue; // "field 1", "campo 2", "Q3" only number the fields
      spans.push({ id: `S${String(spans.length).padStart(3, '0')}`, text: t, line });
    }
  });
  return spans;
}

/** What the model sees: the original text plus the tagged spans. */
export function state(text: string, spans: Span[]) {
  return { text, spans: spans.map((s) => `${s.id}| ${s.text}`).join('\n') };
}

/** Pass 1: one role question per span. */
export function catalogQuestions(spans: Span[]): Record<string, unknown> {
  return Object.fromEntries(
    spans.map((s) => [
      `${s.id}.role`,
      { type: 'choice', instructions: `In the context of \`text\`, what is span \`${s.id}\` ("${s.text}")?`, criteria: ROLES },
    ]),
  );
}

/** Pass 2: describe each field. `roles` are the pass-1 picks, keyed by span id. */
export function fieldQuestions(spans: Span[], roles: Record<string, string>): Record<string, unknown> {
  const questions: Record<string, unknown> = {};
  const fields = spans.filter((s) => roles[s.id] === 'field');

  for (const field of fields) {
    const F = field.id;
    const about = `the form field \`${F}\` ("${field.text}")`;
    const scope = spansAfter(spans, roles, field); // attributes/options until the next field

    questions[`${F}.widget`] = {
      type: 'choice',
      instructions: `According to \`text\`, which widget fits ${about} best?`,
      criteria: WIDGETS,
    };
    questions[`${F}.required`] = { type: 'noul', instructions: `According to \`text\`, is ${about} required / mandatory?` };
    questions[`${F}.email`] = { type: 'noul', instructions: `According to \`text\`, must ${about} be an email address?` };
    questions[`${F}.multiple`] = { type: 'noul', instructions: `According to \`text\`, may the user choose SEVERAL options for ${about} (not just one)?` };

    const numbers = unique(scope.flatMap((s) => s.text.match(/\d+/g) ?? []));
    if (numbers.length) {
      questions[`${F}.min`] = {
        type: 'choice',
        instructions: `Which of these numbers is the MINIMUM allowed (length, value or count) for ${about}?`,
        criteria: { ...nullCriteria(numbers), [NONE]: 'No minimum is given' },
      };
      questions[`${F}.max`] = {
        type: 'choice',
        instructions: `Which of these numbers is the MAXIMUM allowed (length, value or count) for ${about}?`,
        criteria: { ...nullCriteria(numbers), [NONE]: 'No maximum is given' },
      };
    }

    for (const option of scope.filter((s) => roles[s.id] === 'option')) {
      questions[`${F}.opt.${option.id}`] = {
        type: 'noul',
        instructions: `Is \`${option.id}\` ("${option.text}") one of the options the user can choose for ${about}?`,
      };
    }
  }
  return questions;
}

/** The spans after a field up to the next field: where its attributes and options live. */
export function spansAfter(spans: Span[], roles: Record<string, string>, field: Span): Span[] {
  const start = spans.indexOf(field) + 1;
  const out: Span[] = [];
  for (let i = start; i < spans.length && roles[spans[i].id] !== 'field'; i++) out.push(spans[i]);
  return out;
}

const unique = (xs: string[]) => [...new Set(xs)];
const nullCriteria = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, null]));
