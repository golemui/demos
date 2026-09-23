/**
 * The pipeline: text → spans → catalog (request 1) → describe fields (request 2)
 * → definition → validation.
 *
 * Two requests, not one, because the second depends on the first: we can only
 * ask "which widget is this field?" once we know which spans are fields.
 */
import { assemble, type Recovered } from './assemble.ts';
import { catalogQuestions, fieldQuestions, splitSpans, state } from './questions.ts';

export interface Validation {
  valid: boolean;
  errors: { path: string; message: string }[];
  warnings: { path: string; message: string }[];
}

export interface RecoverResult extends Recovered {
  validation: Validation;
  questionCount: number;
  elapsedMs: number;
  model: string;
  inputTokens: number;
  requests: unknown[];
  responses: unknown[];
}

export async function recover(text: string): Promise<RecoverResult> {
  const spans = splitSpans(text);
  const shared = state(text, spans);
  const started = performance.now();

  // Request 1: what is each span?
  const catalogRequest = { state: shared, questions: catalogQuestions(spans) };
  const catalog = await post('/api/systemone', catalogRequest);
  const roles = Object.fromEntries(spans.map((s) => [s.id, catalog.answers[`${s.id}.role`].choice]));

  // Request 2: describe the spans that turned out to be fields.
  const fieldRequest = { state: shared, questions: fieldQuestions(spans, roles) };
  const hasFields = Object.keys(fieldRequest.questions).length > 0;
  const described = hasFields ? await post('/api/systemone', fieldRequest) : { answers: {}, usage: { input_tokens: 0 } };

  const elapsedMs = performance.now() - started;
  const recovered = assemble(spans, catalog.answers, described.answers);

  // Belt and braces: the same validator the GolemUI MCP server runs.
  const validation = await post('/api/validate', recovered.definition);

  return {
    ...recovered,
    validation,
    questionCount: Object.keys(catalogRequest.questions).length + Object.keys(fieldRequest.questions).length,
    elapsedMs,
    model: catalog.model,
    inputTokens: catalog.usage.input_tokens + described.usage.input_tokens,
    requests: [catalogRequest, fieldRequest],
    responses: [catalog, described],
  };
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json;
}
