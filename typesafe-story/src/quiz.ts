/**
 * The closed questions have known answers, so grading them is plain code.
 * No model is involved here — and that is the point: TypeSafe only shows up
 * where code cannot judge on its own (the free-text summary, see rubric.ts).
 */
export const ANSWERS: Record<string, string | string[]> = {
  q1: 'no',
  q2: 'forest',
  q3: 'duck',
  q4: ['hat', 'bread'], // multi-select: order does not matter
  q5: 'no',
  q6: 'tree',
};

export function isCorrect(question: string, value: unknown): boolean {
  const expected = ANSWERS[question];
  if (Array.isArray(expected)) {
    const given = Array.isArray(value) ? [...value].sort() : [];
    return given.join() === [...expected].sort().join();
  }
  return value === expected;
}

/** 0..1 — the share of questions answered correctly. */
export function gradeQuiz(data: Record<string, unknown>): { correct: number; total: number } {
  const questions = Object.keys(ANSWERS);
  const correct = questions.filter((q) => isCorrect(q, data[q])).length;
  return { correct, total: questions.length };
}
