/**
 * One TypeSafe request per (skill text, test file): the skill text is the state,
 * every test is one question over it. TypeSafe answers them in parallel and
 * cannot see one another, which is exactly what we want — each test is judged on
 * the text alone.
 */
import { TypeSafeClient, type Questions, type SystemOneResult } from '@typesafe-ai/sdk';
import type { TestCase } from './spec.js';

export interface Thresholds {
  /** Choice: the picked option must be `expect` AND confidence ≥ this. */
  minConfidence: number;
  /** Noul: expect "yes" passes when P(yes) ≥ yes; expect "no" passes when P(yes) ≤ no. */
  noulYes: number;
  noulNo: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { minConfidence: 0.5, noulYes: 0.7, noulNo: 0.3 };

const FRAMING =
  'The `skill` in the state is an instruction document that an AI coding agent must follow when ' +
  'it works with a library called GolemUI. Answer only from what the skill says — not from what ' +
  'seems reasonable in general. If the skill does not settle the question, prefer the option that ' +
  'says so, when there is one.';

/** Question name for variant `i` of a test: the id itself for single-scenario tests. */
export function variantKey(test: TestCase, i: number): string {
  return test.scenarios.length === 1 ? test.id : `${test.id}#${i + 1}`;
}

export function buildQuestions(tests: TestCase[]): Questions {
  const questions: Questions = {};
  for (const t of tests) {
    t.scenarios.forEach((scenario, i) => {
      const instructions = { framing: FRAMING, situation: scenario, question: t.question };
      questions[variantKey(t, i)] = t.options
        ? { type: 'choice', instructions, criteria: t.options }
        : { type: 'noul', instructions };
    });
  }
  return questions;
}

export function buildRequest(skillText: string, tests: TestCase[]) {
  return { state: { skill: skillText }, questions: buildQuestions(tests) };
}

export interface Verdict {
  id: string;
  expect: string;
  /** What the model picked ("yes"/"no" for noul). */
  answer: string;
  /** Choice confidence, or P(yes) for noul. */
  confidence: number;
  /** Probability the model put on the expected answer (0..1). What mutations compare. */
  expectedProb: number;
  probabilities?: Record<string, number>;
  pass: boolean;
  /** Right answer but below the confidence bar. Counts as a fail; flagged so you can see why. */
  weak: boolean;
  /** For multi-scenario tests: expectedProb of every variant, in spec order. */
  variants?: number[];
}

export async function grade(
  client: TypeSafeClient,
  skillText: string,
  tests: TestCase[],
  thresholds: Thresholds,
): Promise<{ verdicts: Verdict[]; usage: SystemOneResult<Questions>['usage']; model: string }> {
  const request = buildRequest(skillText, tests);
  const result = await client.systemOne(request);
  const verdicts = tests.map((t) => {
    const perVariant = t.scenarios.map((_, i) => judge(t, result.answers[variantKey(t, i)], thresholds));
    if (perVariant.length === 1) return perVariant[0]!;
    // The test's verdict is the median variant's, ranked by how much the model backed the
    // expected answer. One odd phrasing does not fail the test; half of them do.
    const ranked = [...perVariant].sort((a, b) => a.expectedProb - b.expectedProb);
    const median = ranked[Math.floor((ranked.length - 1) / 2)]!;
    return { ...median, variants: perVariant.map((v) => v.expectedProb) };
  });
  return { verdicts, usage: result.usage, model: result.model };
}

function judge(test: TestCase, answer: SystemOneResult<Questions>['answers'][string] | undefined, th: Thresholds): Verdict {
  if (!answer) return { id: test.id, expect: test.expect, answer: '(no answer)', confidence: 0, expectedProb: 0, pass: false, weak: false };
  if (answer.type === 'choice') {
    const right = answer.choice === test.expect;
    const confident = answer.confidence >= th.minConfidence;
    return {
      id: test.id,
      expect: test.expect,
      answer: answer.choice,
      confidence: answer.confidence,
      expectedProb: answer.probabilities[test.expect] ?? 0,
      probabilities: { ...answer.probabilities },
      pass: right && confident,
      weak: right && !confident,
    };
  }
  if (answer.type === 'noul') {
    const p = answer.noul;
    const leaning = p >= 0.5 ? 'yes' : 'no';
    const pass = test.expect === 'yes' ? p >= th.noulYes : p <= th.noulNo;
    return {
      id: test.id,
      expect: test.expect,
      answer: leaning,
      confidence: p,
      expectedProb: test.expect === 'yes' ? p : 1 - p,
      pass,
      weak: !pass && leaning === test.expect,
    };
  }
  return { id: test.id, expect: test.expect, answer: `(unexpected ${answer.type})`, confidence: 0, expectedProb: 0, pass: false, weak: false };
}
