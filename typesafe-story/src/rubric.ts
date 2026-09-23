/**
 * Semantic checks on the learner's summary, with TypeSafe.
 *
 * The rubric is data: `story.facts` lists the key events in plain English.
 * Each fact becomes one Noul question ("does the summary mention that …?"),
 * plus a few global checks. All of them travel in ONE request, evaluated in
 * parallel against the same state `{ story, summary }`.
 *
 * The model never grades. It returns probabilities; the thresholds and the
 * score formula below are ordinary code you can tune.
 */

export interface Story {
  chapters: string[];
  facts: Record<string, string>;
}

// A fact counts as covered above COVERED, as missing below MISSING, and as
// "unclear" in between — the model's honest "not sure".
const COVERED = 0.7;
const MISSING = 0.3;

// The two checks that block the lesson (they become validation issues).
const CONTRADICTS = 0.7;
const NOT_SPANISH = 0.3;

export type FactStatus = 'covered' | 'unclear' | 'missing';

export interface Assessment {
  facts: Record<string, { status: FactStatus; p: number }>;
  /** 0..3 along the completeness levels, plus how sure the model is. */
  completeness: { score: number; confidence: number; level: string };
  contradicts: number;
  spanish: number;
  onTopic: number;
  /** 0..100, computed in code from the signals above. */
  score: number;
  /** Blocking problems, shown as validation errors on the textarea. */
  issues: string[];
  elapsedMs: number;
  raw: unknown;
}

const COMPLETENESS_LEVELS = [
  'Says nothing about the events of the story',
  'Mentions only the beginning (the fox is hungry / goes to the river)',
  'Covers the main events (meeting the duck, the lost hat) but not how it ends',
  'Covers all the essential events from beginning to end, including the ending',
];

export function rubricQuestions(story: Story) {
  const questions: Record<string, unknown> = {};

  for (const [id, fact] of Object.entries(story.facts)) {
    questions[`fact_${id}`] = {
      type: 'noul',
      instructions: `Does \`summary\` mention or clearly imply that ${fact}? Judge meaning, not wording or grammar.`,
    };
  }

  questions.on_topic = {
    type: 'noul',
    instructions: 'Is `summary` an attempt to summarise `story` (as opposed to unrelated text or a different story)?',
  };
  questions.contradicts = {
    type: 'noul',
    instructions: 'Does `summary` state something that contradicts the events of `story`?',
  };
  questions.spanish = {
    type: 'noul',
    instructions: 'Is `summary` written in Spanish (even with grammar mistakes)?',
  };
  questions.completeness = {
    type: 'score',
    instructions: 'How completely does `summary` retell the events of `story`?',
    criteria: COMPLETENESS_LEVELS,
  };

  return questions;
}

export async function assess(story: Story, summary: string): Promise<Assessment> {
  const request = {
    state: { story: story.chapters.join('\n\n'), summary },
    questions: rubricQuestions(story),
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

  const a = response.answers;

  const facts: Assessment['facts'] = {};
  for (const id of Object.keys(story.facts)) {
    const p: number = a[`fact_${id}`].noul;
    facts[id] = { p, status: p >= COVERED ? 'covered' : p <= MISSING ? 'missing' : 'unclear' };
  }

  const completeness = {
    score: a.completeness.score,
    confidence: a.completeness.confidence,
    level: COMPLETENESS_LEVELS[Math.round(a.completeness.score)],
  };
  const contradicts: number = a.contradicts.noul;
  const spanish: number = a.spanish.noul;
  const onTopic: number = a.on_topic.noul;

  // ---- The score. Weights are yours; changing them needs no new request. ----
  const factIds = Object.keys(facts);
  const coverage =
    factIds.reduce((sum, id) => sum + (facts[id].status === 'covered' ? 1 : facts[id].status === 'unclear' ? 0.5 : 0), 0) /
    factIds.length;
  const score = Math.round(100 * (0.6 * coverage + 0.25 * (completeness.score / 3) + 0.15 * (1 - contradicts)));

  // ---- Blocking issues: only the things a learner must fix before finishing. ----
  const issues: string[] = [];
  if (spanish <= NOT_SPANISH) issues.push('Please write your summary in Spanish.');
  if (onTopic <= MISSING) issues.push("This doesn't seem to be about the story you just read.");
  if (contradicts >= CONTRADICTS) issues.push('Something in your summary contradicts the story. Read it again!');

  return { facts, completeness, contradicts, spanish, onTopic, score, issues, elapsedMs, raw: response };
}
