# Story lesson — semantic validation with TypeSafe

> A Duolingo-style reading lesson: the story types itself out chapter by
> chapter, questions appear as you read, and at the end you retell the story in
> your own words — while the form checks your summary against the story, live,
> as you type.

**Built with GolemUI · [TypeSafe](https://typesafe.ai) (Jev, a System One model)**

Scenario: an English speaker learning Spanish. The UI is in English, the story
and the answers are in Spanish.

## What it shows off

- **The whole lesson flow is data.** Chapters, questions and the summary are
  one JSON form definition (`src/lesson-form.json`). Each chapter is a custom
  `typewriter` input that writes `true` to `read.chapterN` when it has finished
  typing, and every later widget is gated with `include: { when: … }` on the
  previous answer. There is no flow logic in the app.
- **Code where code can judge.** The yes/no, single-choice and multi-select
  questions have known answers (`src/quiz.ts`). A wrong answer becomes a
  validation issue via `INJECT_VALIDATION_ISSUES` until it is fixed — no model
  involved.
- **The model where code can't.** The free-text summary is checked with
  TypeSafe (`src/rubric.ts`): one *Noul* per key fact of the story ("does the
  summary mention that…"), a *Score* for completeness, and three global checks
  (on topic, contradicts the story, written in Spanish). All in **one request**,
  evaluated in parallel, on every pause in typing.
- **Two feedback channels, two intentions.** Blocking problems (contradiction,
  wrong language, off-topic) become validation issues on the textarea. Soft
  feedback (which facts you covered, how complete you are) goes into the form's
  **meta** and is rendered by a custom `rubric` display widget through
  interpolated props — a live checklist that ticks off as you write.
- **A score computed in code.** The model returns probabilities; the lesson
  score is a weighted formula in `rubric.ts` (coverage, completeness, no
  contradiction) plus the deterministic quiz score. Change a weight and nothing
  needs to be re-asked.

## Run it

```bash
npm install
cp .env.example .env   # add your TypeSafe API key (or copy ../typesafe-prefill/.env)
npm run dev
```

`server/typesafe-endpoint.ts` is a tiny Vite middleware that forwards
`{ state, questions }` to the TypeSafe API. The browser never sees the key.

## How it works

| File | What it does |
| --- | --- |
| `src/story.json` | The story (three chapters, in Spanish) and the rubric: six key facts in plain English. Single source of the content. |
| `src/lesson-form.json` | The GolemUI JSON definition. Chapter text reaches the typewriters through `{{$meta.chapterN}}`; the rubric widget reads `{{$meta.rubric?.<fact>}}`. |
| `src/quiz.ts` | The answer key and a `gradeQuiz` — plain code. |
| `src/rubric.ts` | `story.facts` → TypeSafe questions; thresholds; the score formula; which results block. |
| `src/App.tsx` | Two event handlers: `checkAnswer` (deterministic, injects issues on wrong answers) and `checkSummary` (debounced TypeSafe call → issues + meta). |
| `src/widgets/Typewriter.tsx` | Custom *input* widget: types the chapter, then writes `true` to its path. Click the text to skip. |
| `src/widgets/Rubric.tsx` | Custom *display* widget: the checklist of facts, driven by its props. Knows nothing about TypeSafe. |
| `src/ScorePanel.tsx` | Quiz + summary score, the raw signals with their probabilities, and the raw response. |
| `server/typesafe-endpoint.ts` | The only server code: `POST /api/systemone` → `@typesafe-ai/sdk`. |
| `spike/` | The calibration run that set the thresholds: nine learner-style summaries (good, partial, vague, with grammar mistakes, in English, contradictory…) against the rubric. |

### Thresholds (from the spike)

A fact counts as **covered** at p ≥ 0.7 and **missing** at p ≤ 0.3; in between
it is shown as *unclear* — the model's honest "not sure". `contradicts ≥ 0.7`
and `spanish ≤ 0.3` are the only results that block. Summaries with learner
grammar mistakes scored the same as clean ones; a summary that stops before the
ending lands exactly on completeness level 2 ("covers the main events but not
how it ends").

## Why TypeSafe and not an LLM here?

A custom GolemUI validator is a synchronous Zod schema — it can't call a model
at all, so any semantic check has to come back asynchronously through the event
handler, and that is where the model matters: TypeSafe answers ten atomic
questions in ~300 ms for a fraction of a cent, cheap enough to run on every
pause in typing; each answer is a calibrated probability, so "unclear" is a
real state rather than a confident guess; and it never writes feedback text —
the messages are yours, templated in code from the signals.
