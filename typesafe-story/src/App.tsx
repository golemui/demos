import { useRef, useState } from 'react';
import { GuiForm } from '@golemui/gui-react';
import type { FormComponentHandle } from '@golemui/react';
import type { FormEvent, FormSubmitEvent } from '@golemui/core';
import type { GuiFormInitConfig } from '@golemui/gui-shared';
import lessonForm from './lesson-form.json';
import story from './story.json';
import { ANSWERS, gradeQuiz, isCorrect } from './quiz';
import { assess, type Assessment } from './rubric';
import { ScorePanel } from './ScorePanel';
import { DemoShell } from './_shared/DemoShell';

const DEBOUNCE_MS = 500;

// The story text reaches the typewriter widgets through meta, so the form
// definition stays generic and story.json is the single source of the content.
const BASE_META = { chapter1: story.chapters[0], chapter2: story.chapters[1], chapter3: story.chapters[2] };

// Module scope: a new config identity would re-initialise the form on every render.
const config: GuiFormInitConfig = {
  formDef: lessonForm,
  meta: BASE_META,
  customWidgetLoaders: {
    typewriter: async () => (await import('./widgets/Typewriter')).Typewriter,
    rubric: async () => (await import('./widgets/Rubric')).Rubric,
  },
};

export default function App() {
  const formRef = useRef<FormComponentHandle>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [quiz, setQuiz] = useState({ correct: 0, total: Object.keys(ANSWERS).length });
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const runId = useRef(0);

  function handleFormEvent(event: FormEvent) {
    if (event.name === 'checkAnswer') checkAnswers(event);
    if (event.name === 'checkSummary') scheduleSummaryCheck(event);
  }

  /** Closed questions: deterministic. A wrong answer becomes a validation issue until fixed. */
  function checkAnswers(event: FormEvent) {
    for (const question of Object.keys(ANSWERS)) {
      const value = event.data[question];
      if (value === undefined) continue; // not answered yet
      event.callback({
        type: 'INJECT_VALIDATION_ISSUES',
        payload: { path: question, issues: isCorrect(question, value) ? null : ['Not quite — read the chapter again.'] },
      });
    }
    setQuiz(gradeQuiz(event.data));
  }

  /** Free text: wait for a pause in typing, then ask TypeSafe once for the whole rubric. */
  function scheduleSummaryCheck(event: FormEvent) {
    clearTimeout(timer.current);
    const summary = String(event.data.summary ?? '').trim();
    if (summary.length < 20) return;
    timer.current = setTimeout(() => checkSummary(event, summary), DEBOUNCE_MS);
  }

  async function checkSummary(event: FormEvent, summary: string) {
    const id = ++runId.current;
    try {
      const result = await assess(story, summary);
      if (id !== runId.current) return; // a newer check is already running

      // 1. Blocking problems → validation issues on the textarea (null clears them).
      event.callback({
        type: 'INJECT_VALIDATION_ISSUES',
        payload: { path: 'summary', issues: result.issues.length ? result.issues : null },
      });

      // 2. Soft feedback → meta, which the rubric widget reads through its props.
      const rubric: Record<string, string> = { completeness: result.completeness.level };
      for (const [factId, fact] of Object.entries(result.facts)) rubric[factId] = fact.status;
      formRef.current?.setMeta({ ...BASE_META, rubric });

      setAssessment(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleSubmit(_event: FormSubmitEvent) {
    setFinished(true);
  }

  return (
    <DemoShell demoName="Story lesson">
      <div className="lesson">
        <section className="lesson__story">
          <h2 className="lesson__title">{story.title}</h2>
          <GuiForm ref={formRef} config={config} formEvent={handleFormEvent} formSubmit={handleSubmit} />
        </section>
        <aside className="lesson__side">
          <ScorePanel quiz={quiz} assessment={assessment} error={error} finished={finished} />
        </aside>
      </div>
    </DemoShell>
  );
}
