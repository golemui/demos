# Hotel Concierge — AG-UI × Mastra × GolemUI

> A chat concierge that books hotel rooms with real forms. The forms are generated from the hotel's OpenAPI; the agent only decides what to ask.
>
> A second tab runs the same concierge the other way — **pure A2UI over AG-UI**: the agent designs every form itself with A2UI's basic catalog — so the two can be compared side by side.

Type "Book a room for 2 people next week, half board" and the concierge replies
with a form that asks only for what it doesn't know yet (dates, rooms, car).
"We are 6 people and travel with a baby, need parking" produces a different form,
then (after checking availability on the server) a short "Special requests"
form with just the crib, parking and license-plate fields. Those requests are
part of the booking: they show up in the review, travel in the same
`POST /bookings`, and are listed on the confirmed booking. Every widget, label,
option and validator comes from the API contract. The LLM never writes a form.

**Built with GolemUI · Mastra · AG-UI · A2UI · React**

## Two variants, one hotel

Same Mastra setup, same model, same AG-UI client, same mock hotel API. Each tab
talks to its own agent:

- **GolemUI** (`POST /agui/golem`) — frontend tools. The agent calls
  `ask_user({ operation, fields, prefill })`, `confirm_booking` and
  `collect_payment`; the app renders the forms generated from the OpenAPI and
  calls the API itself.
- **A2UI** (`POST /agui/pure`) — declarative generative UI the AG-UI way:
  [`@ag-ui/a2ui-middleware`](https://www.npmjs.com/package/@ag-ui/a2ui-middleware)
  injects the A2UI v0.9 basic catalog's schema and a `render_a2ui` tool; the
  agent writes every surface (inputs, bindings, checks, buttons); Google's
  [`@a2ui/react`](https://www.npmjs.com/package/@a2ui/react) renders it; UI
  actions go back through `forwardedProps.a2uiAction`; and the agent calls the
  hotel API through server tools with what it translated from its own forms.

Measured on the same scenario ("We are 6 people and travel with a baby, need
parking" → stay → special requests → review → pay), with the scripted mock model
(`npm run e2e` prints both numbers):

|                                   | A2UI | GolemUI |
| --------------------------------- | ---- | ------- |
| UI written by the agent           | **≈5.7 KB** in 4 `render_a2ui` calls | **≈0.7 KB** in 4 tool calls |
| UI context sent on every run      | ≈35 KB (catalog schema + render tool + usage guide) | ≈5.7 KB (3 tool definitions, from the contract) |
| Data back from a form             | the form's own shape (`"guests": "6"`, `"board": ["half"]`, split dates) — the LLM translates it | the API's shape, unchanged |
| Validation                        | `checks` per input; no cross-field rules | the contract's validators + host business rules inline |
| Who calls `POST /bookings`        | the agent (server tool) | the app |
| Card number                       | in the action context, so in the agent's history | never leaves the checkout (brand + last 4 only) |
| A surface the renderer rejects    | error sent back to the agent, which re-renders it | can't happen: the agent writes no UI |
| Changing it before paying         | the agent designs another form, then calls `update_booking` | `ask_user({ operation: "updateBooking", fields: ["car"] })`, then a review that PATCHes the same booking |

(The byte counts are for that scenario without a change; `npm run e2e` also
changes the car before paying in the GolemUI tab.)

Ask the A2UI tab for "a slider for guests" to see the renderer row: the mock writes
a `Slider` with `step`, a prop the basic catalog doesn't have. The middleware's
validation lets it through, the renderer rejects it (`Unrecognized key(s) in
object: 'step'`), and the app sends the error back so the agent re-renders the
surface. Real models make this kind of mistake: Claude has written `Slider.step`,
and `TextField.textFieldType` (A2UI v0.8's name for `variant`) despite being given
the v0.9 schema.

## What it shows off

- **Forms from the contract, not from the prompt.** `npm run forms` runs the
  GolemUI MCP's `generateFromOpenapi` over the hotel's OpenAPI and checks in
  one validated form per operation. At run time the agent calls
  `ask_user({ operation, fields, prefill })`, and the app keeps only those
  fields of the generated form. Fields can be sub-fields of an optional group
  (`specialRequests.babyCrib`), shown in a section titled from the contract. The agent picks the operation, the fields and
  the prefill. The generated form fixes how each field looks and validates.
- **Data in the API's shape.** A submitted form *is* the request body
  (`dates: { start, end }`), so it goes to the agent and the API unchanged.
- **A human-in-the-loop harness.** The agent *proposes* a booking
  (`confirm_booking`). The guest reviews it in the same generated form, sees a
  price breakdown computed by host code and recomputed live, and can edit or
  reject it. On confirm the **app** calls `POST /bookings`, and the agent gets
  the server's booking plus a diff of what the guest changed.
- **Business rules where they belong.** Cross-field rules (9 guests need 3
  rooms, a stay is at most 30 nights) live in one shared module. The server
  enforces them (422), and the form shows them inline through GolemUI's
  `INJECT_VALIDATION_ISSUES`.
- **A hand-crafted surface where it pays off.** Payment reuses the animated
  checkout from the [credit-card demo](../credit-card) as is (`gui.*` API and
  custom React widgets). Card data never leaves the component: the API and the agent only
  get the brand and last 4 digits.
- **AG-UI with a real agent framework.** The server is a Mastra agent exposed
  over AG-UI with `@ag-ui/mastra`. The React chat is a generic AG-UI client
  (`HttpAgent`) and would work unchanged against any AG-UI backend. Frontend
  tools run in the browser, a server tool (`check_availability`) runs inside
  Mastra, and both stream through the same protocol.
- **No database.** The conversation lives in the browser (AG-UI sends the
  history on every run) and the hotel API is an in-memory mock, so a restart
  wipes it.

## Run it

Requires Node 20+.

```bash
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY
npm run dev               # server on :8000 + app on http://localhost:5173
```

If the API answers "This API key is not scoped to a workspace", either use a
workspace-scoped key or add `ANTHROPIC_WORKSPACE_ID=wrkspc_…` to `.env` (the
workspace id is in the Console's workspace settings).

No API key, or offline? Run the scripted mock model instead. Only the LLM is
fake; Mastra, AG-UI and the browser run the real code path:

```bash
npm run dev:mock
```

Other commands:

```bash
npm run forms       # regenerate shared/forms/*.json from the OpenAPI
npm test            # contract/forms/pricing tests + full agent flow through Mastra
npm run typecheck   # server tsc + app production build
npm run e2e         # headless Chrome, whole conversation (starts its own servers)
```

## Changing a booking before paying

The contract has `PATCH /bookings/{bookingId}` (`updateBooking`): any booking
field, while the booking is unpaid; the server reprices it and re-checks
availability (409 once paid). Adding it took a contract change and
`npm run forms` — no new form was written.

- **GolemUI tab.** Close the checkout (the agent then asks whether you'd like
  to change anything), or just write "before paying, I want to rent a car". The
  agent calls `ask_user` for `updateBooking` with only that field, then
  `confirm_booking` with the full updated proposal and the `bookingId`, and the
  review PATCHes that booking instead of creating a second one. Writing in the
  chat while a form is still open answers that tool call with
  `{ "status": "dismissed" }`: every AG-UI tool call needs a result before the
  next run.
- **A2UI tab.** The agent designs a form for the change and calls the
  `update_booking` server tool with what it translated from it.

## How it works

```
shared/                       the contract and everything derived from it
  src/hotel-api.ts            ★ OpenAPI 3.1: createBooking (+ specialRequests), updateBooking, checkAvailability, createPayment
  scripts/generate-forms.ts   OpenAPI → GolemUI JSON (gui-mcp), + overrides & messages
  forms/*.json                createBooking + updateBooking, generated, validated, checked in
  src/forms.ts                slice a generated form to the fields the agent asked for
  src/tools.ts                frontend tool definitions, descriptions built from the contract
  src/pricing.ts              pure pricing + cross-field rules (server AND app use it)
server/
  src/agent.ts                the two Mastra agents (GolemUI: no form knowledge in the prompt) + server tools
  src/server.ts               POST /agui/{golem,pure} (AG-UI SSE) + /api/* mock API
  src/variants.ts             per-variant event stream: getLocalAgent, + the A2UI middleware for pure
  src/a2ui-catalog.ts         the basic catalog schema the pure agent sees, built from web_core's catalog.json
  src/hotel-service.ts        in-memory hotel API, validates against the contract
  src/mock-model.ts           MOCK_AGENT=1: scripted AI SDK model behind the real agent
  src/mock-model-pure.ts      …and the pure agent's, which writes render_a2ui surfaces
app/src/
  agui/agentStore.ts          HttpAgent → React (useSyncExternalStore), + A2UI actions
  agui/ChatPanel.tsx          generic chat; tool calls from a registry, A2UI activities, renderer → agent repairs
  a2ui/A2uiActivity.tsx       an `a2ui-surface` activity → @a2ui/react with the basic catalog
  agui/reparentToolCalls.ts   fixes @ag-ui/mastra's tool-call parenting (see notes)
  tools/AskUserSurface.tsx    ask_user → sliced contract form
  tools/ConfirmBookingSurface.tsx  the harness: review, live price, diff, POST /bookings
  tools/PaymentSurface.tsx    the credit-card checkout as a tool surface
  inspector/Inspector.tsx     what reached the API and who sent it, UI bytes the agent wrote, the raw AG-UI stream
```

One turn, end to end:

1. The browser `POST`s the conversation plus the three frontend tools to `/agui/golem`.
2. `getLocalAgent()` hands the tools to Mastra as client tools. The model calls
   `ask_user`, and the run ends with `RUN_FINISHED { pendingToolCallIds }`.
3. The chat mounts the surface registered for `ask_user` once the call is
   complete (`TOOL_CALL_END`). Mounting during the args stream would make
   GolemUI re-initialise the form on every chunk.
4. On submit, the data goes back as a `tool` message and the next run starts.

The agent's instructions contain no widget types, layouts or validators. The
`ask_user` description lists the operations and fields, and it is generated
from the OpenAPI as well. Change a field in `hotel-api.ts`, run `npm run forms`,
and the API, the forms and the agent's view stay in sync.

## Notes for AG-UI / Mastra

- `@ag-ui/mastra@2.0.0` parents **every** tool call of a run to the run's first
  assistant message, even when more text came in between (text → server tool
  → text → frontend tool). The chat would then render the form above the text
  that introduces it. Worse, the replayed history ends with an assistant
  message, so the model sees the conversation ending on its own turn.
  [`reparentToolCalls`](app/src/agui/reparentToolCalls.ts) moves each call to
  the right message using the event order.
- `@ag-ui/core@1.0` moved the zod schemas to `@ag-ui/core/schemas`.

## Notes for A2UI over AG-UI

- `agent.use(middleware)` only wraps `runAgent()`. A server that streams the raw
  `agent.run(input)` must call `middleware.run(input, agent)` itself, or the
  middleware never runs.
- With the middleware's `injectA2UITool` flag, `@ag-ui/mastra` 2 removes
  `render_a2ui` and injects `generate_a2ui` instead: the agent describes the UI
  in prose and a **second LLM** (a subagent) writes the A2UI, with a
  validate-and-retry loop. This demo adds `render_a2ui` and its usage guide
  itself (the package's own exports), so the concierge writes the A2UI, like
  the pure variant of [genkit-a2ui-hotel-booking](../genkit-a2ui-hotel-booking).
- The middleware turns a UI action into a synthetic `log_a2ui_event` tool call
  in the run's input, on the server only. With the conversation in the browser
  (no thread store), the next run would forget what the guest submitted, so the
  app keeps the same pair in its history (`sendA2uiAction`).
- The middleware validates component names, required props and bindings, not
  unknown props. A `Slider` with `step` reaches the browser, where web_core's
  strict schemas reject the whole surface.
- Its usage guide's example uses `Title` and `Metric` components and a `gap`
  prop, none of which are in the basic catalog.
- The pure agent's catalog is generated from `@a2ui/web_core`'s own
  `catalog.json` (flattened, ≈33 KB), not hand-written, so the props it's told
  about are the ones the renderer accepts.
- `@a2ui/react` 0.14 renders the basic catalog as web components. `Text` shows
  markdown literally until a renderer is installed
  (`setMarkdownRenderer(renderMarkdown)` from `@a2ui/markdown-it`). The theme is
  CSS variables; the renderer's defaults sit in an adopted stylesheet on
  `:root`, so the Clay mapping is set on the surface's frame instead.
- Don't `dispose()` the `MessageProcessor` in an effect cleanup: StrictMode's
  simulated unmount tears down the surface it just mounted, and typing into it
  stops working.

## Notes for GolemUI

- The demo uses the `./json` entry of `@golemui/gui-mcp` (`generateFromOpenapi`,
  `validateFormDefinition`). It is an 8 MB bundle, too heavy for the browser.
  That's why forms are generated at build time and only sliced at run time.
- Generated validators carry no `messages`, so an empty required field shows
  "Invalid input: expected string, received null". The generator script adds
  label-based messages. Integer validators still reject a `required` message
  key (only `invalid` is accepted).
- The generator ignores an object's `title` (the `specialRequests` group comes
  out as an untitled layout), and a `label` override on that layout makes the
  form invalid. The app wraps such groups in a one-section `accordion` titled
  from the contract.
- `markdownText` needs a `dependencies.markdown` parser or it renders blank.

## Learn more

- [GolemUI docs](https://golemui.com/dx/getting-started/installation/)
- [Generating forms from a schema](https://golemui.com/json/mcp/generating-from-a-schema.md)
- [AG-UI protocol](https://docs.ag-ui.com) · [Generative UI in AG-UI](https://docs.ag-ui.com/concepts/generative-ui-specs)
- [A2UI](https://a2ui.org)
- [Mastra](https://mastra.ai/docs)
