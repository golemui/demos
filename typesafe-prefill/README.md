# Prefill a form from free text — with TypeSafe

> Paste an email, describe a problem in your own words, and watch a GolemUI
> form fill itself in — without a prompt, without generation, and without the
> model ever inventing a value.

**Built with GolemUI · [TypeSafe](https://typesafe.ai) (Jev, a System One model)**

## What it shows off

- **The form definition IS the question set.** `src/compile.ts` walks the
  GolemUI JSON definition and turns every input widget into one TypeSafe
  question: a `select` becomes a *Choice* whose criteria are the widget's own
  options, a `checkbox` becomes a *Noul* (probability that the label is true),
  an ordered `radiogroup` becomes a *Score* over its options. No prompt to
  write or maintain — change the form and the questions change with it.
- **Select, don't generate.** For text inputs the widget's own validator
  (`format: "email"`, or its `pattern`) finds the candidate spans in the text;
  TypeSafe only picks *which one* the customer means, and code copies it
  verbatim. The model cannot invent an order number or mistype an email.
- **One call, every field.** All questions go in a single request and are
  evaluated in parallel — the whole form resolves in roughly the time of one
  question, so it runs on every pause in typing, not on a "fill with AI" button.
- **Confidence drives the decision.** Every answer comes with a calibrated
  probability distribution. `src/prefill.ts` fills the confident fields, leaves
  the doubtful ones for the person, and the right-hand panel shows exactly how
  sure the model was — including the honest "not sure" cases.
- **People win.** A field edited by hand is never overwritten by a later prefill.

## Run it

```bash
npm install
cp .env.example .env   # add your TypeSafe API key
npm run dev
```

The key stays on the dev server: `server/typesafe-endpoint.ts` is a tiny Vite
middleware that forwards `{ state, questions }` to the TypeSafe API. The
browser never sees the key.

## How it works

| File | What it does |
| --- | --- |
| `src/claim-form.json` | A plain GolemUI JSON form definition: an order claim with order number, email, reason, resolution, product condition, urgency and free-text details. |
| `src/compile.ts` | **Definition → questions.** Flattens layouts, maps each input widget to a TypeSafe question, and finds candidate spans for text inputs. |
| `src/prefill.ts` | Sends one request with every question, then decides per field: fill it, or leave it to the person. The thresholds live at the top of the file. |
| `src/App.tsx` | Debounces the free-text box, merges the prefill into the form (never overwriting hand-typed values) via `setData`, and tracks the live form data through the `changed` event. |
| `src/ConfidencePanel.tsx` | Renders each field's answer, confidence and probability distribution, plus the raw questions/answers for the curious. |
| `server/typesafe-endpoint.ts` | The only server code: `POST /api/systemone` → `@typesafe-ai/sdk`. |

### Widget → question mapping

| Widget | Question | Value written |
| --- | --- | --- |
| `select`, `radiogroup`, `dropdown` | Choice over the options (+ `none`) | the option's `value` |
| `radiogroup` listed in `scales` | Score over the options, in order | the option nearest the score |
| `checkbox`, `toggle` | Noul | `true` / `false` outside the uncertain band |
| `textinput` with `format: "email"` or `pattern` | Choice over the spans the validator finds (+ `none`) | the span, verbatim |
| `textarea` | — (free text can't be selected) | untouched |

The one thing the definition cannot express is whether a radiogroup's options
form an ordered scale; that hint (`{ scales: ['condition'] }`) sits next to the
config in `App.tsx`.

## Why TypeSafe and not an LLM here?

An LLM with structured output can produce a similar JSON on a good day. What it
cannot give you is the guarantee: TypeSafe's answer is a probability
distribution *over the options you supplied*, so the value that lands in the
form is valid by construction, each field carries its own calibrated
confidence, every question is evaluated independently (adding fields does not
degrade the others), and a request takes on the order of 100 ms and costs a
fraction of a cent — cheap enough to run on every keystroke pause.
