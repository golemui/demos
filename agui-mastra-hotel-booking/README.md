# Hotel Concierge — AG-UI × Mastra × GolemUI

> A chat concierge that books hotel rooms with real forms. The forms are generated from the hotel's OpenAPI; the agent only decides what to ask.

Type "Book a room for 2 people next week, half board" and the concierge replies
with a form that asks only for what it doesn't know yet (dates, rooms, car).
"We are 6 people and travel with a baby, need parking" produces a different form,
then (after checking availability on the server) a short "Special requests"
form with just the crib, parking and license-plate fields. Those requests are
part of the booking: they show up in the review, travel in the same
`POST /bookings`, and are listed on the confirmed booking. Every widget, label,
option and validator comes from the API contract. The LLM never writes a form.

**Built with GolemUI · Mastra · AG-UI · React**

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
  checkout from the credit-card demo as is (`gui.*` API and custom React
  widgets). Card data never leaves the component: the API and the agent only
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

No key, or no Wi-Fi on stage? Run the scripted mock model instead. Only the LLM
is fake; Mastra, AG-UI and the browser run the real code path:

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

## How it works

```
shared/                       the contract and everything derived from it
  src/hotel-api.ts            ★ OpenAPI 3.1: createBooking (+ specialRequests), checkAvailability, createPayment
  scripts/generate-forms.ts   OpenAPI → GolemUI JSON (gui-mcp), + overrides & messages
  forms/*.json                generated, validated, checked in
  src/forms.ts                slice a generated form to the fields the agent asked for
  src/tools.ts                frontend tool definitions, descriptions built from the contract
  src/pricing.ts              pure pricing + cross-field rules (server AND app use it)
server/
  src/agent.ts                Mastra agent (no form knowledge in the prompt) + server tool
  src/server.ts               POST /agui (AG-UI SSE via getLocalAgent) + /api/* mock API
  src/hotel-service.ts        in-memory hotel API, validates against the contract
  src/mock-model.ts           MOCK_AGENT=1: scripted AI SDK model behind the real agent
app/src/
  agui/agentStore.ts          HttpAgent → React (useSyncExternalStore)
  agui/ChatPanel.tsx          generic chat; renders tool calls from a registry
  agui/reparentToolCalls.ts   fixes @ag-ui/mastra's tool-call parenting (see notes)
  tools/AskUserSurface.tsx    ask_user → sliced contract form
  tools/ConfirmBookingSurface.tsx  the harness: review, live price, diff, POST /bookings
  tools/PaymentSurface.tsx    the credit-card checkout as a tool surface
  inspector/Inspector.tsx     what reached the API + the raw AG-UI event stream
```

One turn, end to end:

1. The browser `POST`s the conversation plus the three frontend tools to `/agui`.
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

## Notes for GolemUI

- `@golemui/gui-mcp`: up to 2.0.0-rc.4 the root entry and the CLI imported `subscript`,
  `rxjs` and `ts.data.json` without declaring them, so `npx @golemui/gui-mcp` failed with
  `ERR_MODULE_NOT_FOUND`. 2.0.0 fixes it. This demo only uses the `./json` entry.
- `@golemui/gui-mcp/json` is an 8 MB bundle, too heavy for the browser. That's
  why forms are generated at build time and only sliced at run time.
- Generated validators carry no `messages`, so an empty required field shows
  "Invalid input: expected string, received null". The generator script adds
  label-based messages. Integer validators still reject a `required` message
  key (only `invalid` is accepted).
- The generator ignores an object's `title` (the `specialRequests` group comes
  out as an untitled layout), and a `label` override on that layout makes the
  form invalid. The app wraps such groups in a one-section `accordion` titled
  from the contract.
- `markdownText` needs a `dependencies.markdown` parser or it renders blank.
  That explains the "flaky markdownText" finding in the Angular demo.
- The `datePicker` calendar opens on the current month even when `minDate` is
  later. The popup is also clipped inside a scrolling container (the chat
  thread).
- The reactivity bug from the Angular demo (formEvents dying in the 2nd+ form of
  a thread) doesn't reproduce here. Live repricing and injected validation issues
  work in every form of the conversation.

## Learn more

- [GolemUI docs](https://golemui.com/dx/getting-started/installation/)
- [Generating forms from a schema](https://golemui.com/json/mcp/generating-from-a-schema.md)
- [AG-UI protocol](https://docs.ag-ui.com)
- [Mastra](https://mastra.ai/docs)
