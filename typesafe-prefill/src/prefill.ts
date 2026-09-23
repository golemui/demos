/**
 * Runs one TypeSafe request for the whole form and decides, field by field,
 * whether the answer is confident enough to write into the form.
 *
 * Every question goes in a single call: TypeSafe evaluates them in parallel,
 * so asking about 7 fields costs about the same time as asking about 1.
 */
import { compile, NONE, type Field, type Hints, type Question, type Widget } from './compile';

// Thresholds. These are the knobs you tune per field/risk in a real app.
const MIN_CONFIDENCE = 0.5; // Choice & Score: below this, leave the field to the human
const YES = 0.8; // Noul: at or above → tick the checkbox
const NO = 0.2; //  Noul: at or below → leave it unticked (in between: don't touch)

// What TypeSafe answers, per question type (only the fields we read).
type Answer =
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> }
  | { type: 'noul'; noul: number };

export interface FieldReport {
  path: string;
  label: string;
  kind: Field['kind'];
  /** Human-readable answer, e.g. the option label or "87% yes". */
  answer: string;
  /** 0..1 — how sure the model is. Drives the "applied" decision. */
  confidence: number;
  /** The value written into the form, or undefined when we left it alone. */
  value?: unknown;
  probabilities?: Record<string, number>;
}

export interface PrefillResult {
  /** `{ path: value }` for every field confident enough to fill. */
  values: Record<string, unknown>;
  report: FieldReport[];
  elapsedMs: number;
  request: { state: unknown; questions: Record<string, Question> };
  response: { model: string; answers: Record<string, Answer>; usage: unknown };
}

export async function prefill(
  definition: { form: Widget[] },
  text: string,
  hints: Hints = {},
): Promise<PrefillResult> {
  const fields = compile(definition, text, hints);
  const request = {
    state: { message: text },
    questions: Object.fromEntries(fields.map((f) => [f.path, f.question])),
  };

  const started = performance.now();
  const res = await fetch('/api/systemone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const response = await res.json();
  if (!res.ok) throw new Error(response.error ?? res.statusText);
  const elapsedMs = performance.now() - started;

  const report = fields.map((field) => decide(field, response.answers[field.path]));
  const values = Object.fromEntries(
    report.filter((r) => r.value !== undefined).map((r) => [r.path, r.value]),
  );

  return { values, report, elapsedMs, request, response };
}

/** Turns one typed answer into "fill the field with X" or "leave it alone". */
function decide(field: Field, answer: Answer): FieldReport {
  const base = { path: field.path, label: field.label, kind: field.kind };

  switch (answer.type) {
    case 'choice': {
      const confident = answer.choice !== NONE && answer.confidence >= MIN_CONFIDENCE;
      return {
        ...base,
        // A confident "none" is a real answer too: the message just doesn't say.
        answer: answer.choice === NONE ? 'not in the message' : answer.choice,
        confidence: answer.confidence,
        probabilities: answer.probabilities,
        // The chosen key IS the widget's option value (or the verbatim text span).
        value: confident ? answer.choice : undefined,
      };
    }

    case 'score': {
      // `score` can fall between levels (e.g. 1.4); the nearest option wins.
      const options = field.options!;
      const option = options[Math.round(answer.score)];
      return {
        ...base,
        answer: `${option.label} (${answer.score.toFixed(2)})`,
        confidence: answer.confidence,
        // Probabilities come keyed by level number; show the option labels instead.
        probabilities: Object.fromEntries(
          Object.entries(answer.probabilities).map(([level, p]) => [options[Number(level)].label, p]),
        ),
        value: answer.confidence >= MIN_CONFIDENCE ? option.value : undefined,
      };
    }

    case 'noul': {
      const p = answer.noul;
      return {
        ...base,
        answer: `${Math.round(p * 100)}% yes`,
        // A noul has no confidence of its own: 0.5 is "no idea", 0 or 1 is certain.
        confidence: Math.abs(p - 0.5) * 2,
        value: p >= YES ? true : p <= NO ? false : undefined,
      };
    }
  }
}
