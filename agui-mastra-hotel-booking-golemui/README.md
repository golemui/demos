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

The same concierge with forms designed by the agent itself (A2UI) is in
[agui-mastra-hotel-booking-a2ui](../agui-mastra-hotel-booking-a2ui), and both
side by side in [agui-mastra-hotel-booking-compare](../agui-mastra-hotel-booking-compare).

## What it shows off

- **Forms from the contract, not from the prompt.** `npm run forms` runs the
  GolemUI MCP's `generateFromOpenapi` over the hotel's OpenAPI and checks in
  one validated form per operation. At run time the agent calls
  `ask_user({ operation, fields, prefill })`, and the app keeps only those
  fields of the generated form. Fields can be sub-fields of an optional group
  (`specialRequests.babyCrib`), shown in a section titled from the contract.
  The agent picks the operation, the fields and the prefill. The generated form
  fixes how each field looks and validates.
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
  custom React widgets). Card data never leaves the component: the API and the
  agent only get the brand and last 4 digits.
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
`npm run forms`; no new form was written.

Close the checkout (the agent then asks whether you'd like to change anything),
or just write "before paying, I want to rent a car". The agent calls `ask_user`
for `updateBooking` with only that field, then `confirm_booking` with the full
updated proposal and the `bookingId`, and the review PATCHes that booking
instead of creating a second one. Writing in the chat while a form is still
open answers that tool call with `{ "status": "dismissed" }`: every AG-UI tool
call needs a result before the next run.

## How it works

```
shared/                       the contract and everything derived from it
  src/hotel-api.ts            ★ OpenAPI 3.1: createBooking (+ specialRequests), updateBooking, checkAvailability, createPayment
  src/contract.ts             request schemas and one-line field descriptions, read from the contract
  scripts/generate-forms.ts   OpenAPI → GolemUI JSON (gui-mcp), + overrides & messages
  forms/*.json                createBooking + updateBooking, generated, validated, checked in
  src/forms.ts                slice a generated form to the fields the agent asked for
  src/tools.ts                frontend tool definitions, descriptions built from the contract
  src/pricing.ts              pure pricing + cross-field rules (server AND app use it)
server/
  src/agent.ts                the Mastra agent (no form knowledge in the prompt) + a server tool
  src/server.ts               POST /agui (AG-UI SSE) + /api/* mock API
  src/hotel-service.ts        in-memory hotel API, validates against the contract
  src/mock-model.ts           MOCK_AGENT=1: scripted AI SDK model behind the real agent
app/src/
  agui/agentStore.ts          HttpAgent → React (useSyncExternalStore)
  agui/ChatPanel.tsx          generic chat; tool calls rendered from a registry
  agui/reparentToolCalls.ts   fixes @ag-ui/mastra's tool-call parenting (see notes)
  tools/AskUserSurface.tsx    ask_user → sliced contract form
  tools/ConfirmBookingSurface.tsx  the harness: review, live price, diff, POST /bookings
  tools/PaymentSurface.tsx    the credit-card checkout as a tool surface
  inspector/Inspector.tsx     what reached the API, and the raw AG-UI stream
```

Files that start with an `AUTO-GENERATED from shared/hotel/…` banner are copies
of the hotel core this demo shares with the other hotel demos of the repo
(contract, pricing, mock API, form generator). They are complete and work as
they are; in the repo, they are edited in `shared/hotel/` and copied with
`npm run sync`.

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

## Learn more

- [GolemUI docs](https://golemui.com/dx/getting-started/installation/)
- [Generating forms from a schema](https://golemui.com/json/mcp/generating-from-a-schema.md)
- [AG-UI protocol](https://docs.ag-ui.com)
- [Mastra](https://mastra.ai/docs)
