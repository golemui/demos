# Text to form — structure recovery with TypeSafe

> Describe a form in plain text — a tidy field spec, a bullet list, notes from a
> call — and get a valid GolemUI JSON definition, rendered live. No model
> writes a single character of JSON.

**Built with GolemUI · [TypeSafe](https://typesafe.ai) (Jev, a System One model)**

This is the [structure recovery](https://docs.typesafe.ai/cookbooks/autoformat)
pattern with a GolemUI definition as the output instead of Markdown, in two
passes: code cuts the input into small spans (lines, then commas, "and"/"or",
colons), the model **catalogs** every span (field, attribute, option, hint,
intro), and then — for the spans that turned out to be fields — **describes**
each one by picking from sets the code enumerated. Code assembles the result.
Because both passes see the whole text, "name, surname and age" on one line
works as well as one field per line.

## What it shows off

- **The widget catalog is the answer space.** For every line, one *Choice*
  question over GolemUI's widget types decides what to build. The model cannot
  invent a widget that doesn't exist.
- **Labels are copied, never written.** A field's label is the text of its
  span, verbatim. Numbers (min/max) and options work the same way: found by
  code, picked by the model.
- **Two requests for the whole text.** Pass 1 asks one role question per span;
  pass 2 asks everything else only about the spans that are fields (≈ 35–65
  questions in total for a ten-line spec, ≈ 0.5–1.5 s). The second request
  exists because it depends on the first — the fields don't exist until the
  catalog has answered.
- **Valid by construction.** Every key in the definition is written by
  `assemble.ts`, so the schema validator — the same one the GolemUI MCP server
  runs — is a check, not a repair step. It has passed on every sample so far.
- **Every decision is visible.** The table under the input shows, per line,
  the role, widget, label and required-ness with their confidence.

## Run it

```bash
npm install
cp .env.example .env   # add your TypeSafe API key (or copy ../typesafe-prefill/.env)
npm run dev
```

`server/typesafe-endpoint.ts` is a small Vite middleware with two routes:
`/api/systemone` forwards to TypeSafe (the key never reaches the browser) and
`/api/validate` runs `validateFormDefinition` from `@golemui/gui-mcp/json`.

## How it works

| File | What it does |
| --- | --- |
| `src/questions.ts` | Text → tagged spans (`S003\| …`) → the pass-1 catalog questions and the pass-2 field questions. Read the top comment for the list. |
| `src/assemble.ts` | Answers → definition. Widget → validator type, span text → label and path slug, options → `props.options`/`items`, hints attach to the previous field. |
| `src/recover.ts` | The pipeline: catalog request, field request, assemble, validate. |
| `src/App.tsx` | Input on the left, rendered `GuiForm` / JSON on the right, decisions table below. |
| `src/samples.ts` | Four inputs: a one-liner, a field spec, a workshop signup, notes from a client call. |
| `spike/` | `run.mts` (the original one-file spike), `live.mts` (runs the app's real modules against the API and validates the output), recorded `fixtures.json`. |

`questions.ts`, `assemble.ts` and `recover.ts` import each other with explicit
`.ts` extensions so they also run straight under Node
(`node --experimental-strip-types`), which is how `spike/live.mts` tests them.

### What the model decides

| Pass | Question | Type | Used for |
| --- | --- | --- | --- |
| 1 | role, per span | Choice: field / attribute / option / hint / intro / other | which spans become widgets; hints attach to the previous field |
| 2 | widget, per field | Choice over the catalog | `type` |
| 2 | required, email, multiple | Noul | `validator.required`, `format: "email"`, radiogroup vs multiList |
| 2 | min, max | Choice over the numbers that follow the field | `minLength`/`maxLength`, `minimum`/`maximum`, `minItems`/`maxItems` |
| 2 | opt.\<span\> | one Noul per option span that follows the field | the options of a choice widget |

Pure numbering markers ("field 1", "Q3") are dropped in code before asking —
direct evidence stays in code.

## Limits, on purpose

Labels are literal: "Tu email:" becomes "Tu email", it is never rephrased.
Options must appear in the text. And a request that needs *invention* — "a
dropdown with the EU countries", "make it sensible for a dental clinic" — is
not a selection problem; that part belongs to an LLM (with the MCP validator
behind it). This demo covers everything the user stated explicitly, which in
practice is most of the prompt.
