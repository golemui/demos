# Hotel Concierge — A2UI over AG-UI × Mastra

> A chat concierge that books hotel rooms with forms the agent designs itself, with A2UI's basic catalog, streamed over AG-UI.

Type "We are 6 people and travel with a baby, need parking" and the concierge
writes a form for the stay (dates, guests, rooms, board, car), then one for the
special requests it heard, a review card with the price, and a card payment
form. Each one is an A2UI surface: the components, their data bindings, the
validation checks and the buttons are all written by the model. Google's A2UI
renderer draws them, and what the guest submits goes back to the agent, which
calls the hotel API through server tools.

**Built with A2UI · AG-UI · Mastra · React**

The same concierge with forms generated from the hotel's OpenAPI (GolemUI) is in
[agui-mastra-hotel-booking-golemui](../agui-mastra-hotel-booking-golemui), and both
side by side in [agui-mastra-hotel-booking-compare](../agui-mastra-hotel-booking-compare).

## What it shows off

- **Declarative generative UI, the AG-UI way.**
  [`@ag-ui/a2ui-middleware`](https://www.npmjs.com/package/@ag-ui/a2ui-middleware)
  injects the A2UI v0.9 basic catalog's schema and a `render_a2ui` tool into
  every run, and turns each `render_a2ui` call into an `a2ui-surface` activity
  event. The React app renders it with
  [`@a2ui/react`](https://www.npmjs.com/package/@a2ui/react), and sends UI
  actions back through `forwardedProps.a2uiAction`.
- **The agent owns the whole flow.** It translates what its forms send back
  (their own shape: `"guests": "6"`, `"board": ["half"]`, split dates) into the
  API's shape, prices the booking (`quote_booking`), creates it
  (`create_booking`), changes it (`update_booking`) and charges it
  (`create_payment`), all through server tools.
- **The renderer → agent error path.** When the renderer rejects a surface
  (a prop the catalog doesn't have, a wrong type), the app sends the error
  back to the agent and asks it to render the surface again, at most twice per
  message. Ask for "a slider for guests" to see it: the mock writes a `Slider`
  with `step`, which the basic catalog doesn't have. The middleware's
  validation lets it through, the renderer rejects it (`Unrecognized key(s) in
  object: 'step'`), and the agent re-renders the surface. Real models make this
  kind of mistake: Claude has written `Slider.step`, and
  `TextField.textFieldType` (A2UI v0.8's name for `variant`) despite being given
  the v0.9 schema.
- **What crosses the wire.** The inspector lists the hotel API requests the
  agent made, the bytes of A2UI it wrote, and the raw AG-UI event stream. The
  card form's whole context, card number included, goes to the agent: it keeps
  only the brand and last 4 digits for the API because its instructions say so.
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
fake: it writes `render_a2ui` surfaces like a model does, and Mastra, the A2UI
middleware, AG-UI and the browser run the real code path:

```bash
npm run dev:mock
```

Other commands:

```bash
npm test            # pricing + mock API tests, and the whole flow over HTTP
npm run typecheck   # server tsc + app production build
npm run e2e         # headless Chrome, whole conversation (starts its own servers)
```

## Changing a booking before paying

The contract has `PATCH /bookings/{bookingId}` (`updateBooking`): any booking
field, while the booking is unpaid; the server reprices it and re-checks
availability (409 once paid). Write "before paying, I want to rent a car": the
agent designs a form for the change and calls the `update_booking` server tool
with what it translated from it, on the same booking.

## How it works

```
shared/
  src/hotel-api.ts            ★ OpenAPI 3.1: createBooking (+ specialRequests), updateBooking, checkAvailability, createPayment
  src/contract.ts             request schemas read from the contract (the server tools' input schemas)
  src/pricing.ts              pure pricing + cross-field rules
  src/tools.ts                tool names shared by the server, the mock model and the inspector
server/
  src/server.ts               POST /agui (AG-UI SSE) through the A2UI middleware + /api/* mock API
  src/a2ui-catalog.ts         the basic catalog schema the agent sees, built from web_core's catalog.json
  src/agent.ts                the Mastra agent and its server tools
  src/hotel-service.ts        in-memory hotel API, validates against the contract
  src/mock-model.ts           MOCK_AGENT=1: scripted AI SDK model that writes render_a2ui surfaces
app/src/
  agui/agentStore.ts          HttpAgent → React (useSyncExternalStore), + A2UI actions
  agui/ChatPanel.tsx          generic chat: A2UI activities, server tool chips, renderer → agent repairs
  agui/reparentToolCalls.ts   fixes @ag-ui/mastra's tool-call parenting (see notes)
  a2ui/A2uiActivity.tsx       an `a2ui-surface` activity → @a2ui/react with the basic catalog
  inspector/Inspector.tsx     what reached the API, A2UI bytes the agent wrote, the raw AG-UI stream
```

Files that start with an `AUTO-GENERATED from shared/hotel/…` banner are copies
of the hotel core this demo shares with the other hotel demos of the repo
(contract, pricing, mock API). They are complete and work as they are; in the
repo, they are edited in `shared/hotel/` and copied with `npm run sync`.

One turn, end to end:

1. The browser `POST`s the conversation to `/agui`. It declares no tools.
2. The A2UI middleware adds the basic catalog's schema to the run's context,
   and the server adds `render_a2ui` and its usage guide. `getLocalAgent()`
   runs the Mastra agent with them.
3. The model calls `render_a2ui({ surfaceId, components, data })`. The
   middleware streams it as `ACTIVITY_SNAPSHOT { activityType: "a2ui-surface" }`
   with the A2UI operations, and the chat renders them.
4. When the guest clicks a button, the browser sends the action in
   `forwardedProps.a2uiAction`. The middleware hands it to the agent as a
   `log_a2ui_event` tool result (`User performed action "booking_details" …
   Context: {…}`), and the agent calls its server tools with what it read there.

## Notes for AG-UI / Mastra

- `@ag-ui/mastra@2.0.0` parents **every** tool call of a run to the run's first
  assistant message, even when more text came in between (text → server tool
  → text → `render_a2ui`). The chat would then render the surface above the
  text that introduces it, and the replayed history would end with an
  assistant message. [`reparentToolCalls`](app/src/agui/reparentToolCalls.ts)
  moves each call to the right message using the event order.
- `@ag-ui/core@1.0` moved the zod schemas to `@ag-ui/core/schemas`.

## Notes for A2UI over AG-UI

- `agent.use(middleware)` only wraps `runAgent()`. A server that streams the raw
  `agent.run(input)` must call `middleware.run(input, agent)` itself, or the
  middleware never runs.
- With the middleware's `injectA2UITool` flag, `@ag-ui/mastra` 2 removes
  `render_a2ui` and injects `generate_a2ui` instead: the agent describes the UI
  in prose and a **second LLM** (a subagent) writes the A2UI, with a
  validate-and-retry loop. This demo adds `render_a2ui` and its usage guide
  itself (the package's own exports), so the concierge writes the A2UI.
- The middleware turns a UI action into a synthetic `log_a2ui_event` tool call
  in the run's input, on the server only. With the conversation in the browser
  (no thread store), the next run would forget what the guest submitted, so the
  app keeps the same pair in its history (`sendA2uiAction`).
- The middleware validates component names, required props and bindings, not
  unknown props. A `Slider` with `step` reaches the browser, where web_core's
  strict schemas reject the whole surface.
- Its usage guide's example uses `Title` and `Metric` components and a `gap`
  prop, none of which are in the basic catalog.
- The agent's catalog is generated from `@a2ui/web_core`'s own `catalog.json`
  (flattened, ≈33 KB), not hand-written, so the props it's told about are the
  ones the renderer accepts.
- `@a2ui/react` 0.14 renders the basic catalog as web components. `Text` shows
  markdown literally until a renderer is installed
  (`setMarkdownRenderer(renderMarkdown)` from `@a2ui/markdown-it`). The theme is
  CSS variables; the renderer's defaults sit in an adopted stylesheet on
  `:root`, so the mapping to the page's theme is set on the surface's frame.
- Don't `dispose()` the `MessageProcessor` in an effect cleanup: StrictMode's
  simulated unmount tears down the surface it just mounted, and typing into it
  stops working.
- web_core 0.14's `numeric` check rejects strings, but a `TextField` (even
  `variant: number`) stores strings, so the mock validates numbers with `regex`.

The page chrome (header, theme toggle, Clay colors) is the repo's shared demo
shell, which uses GolemUI's theme stylesheet; the chat itself uses no GolemUI.

## Learn more

- [A2UI](https://a2ui.org)
- [AG-UI protocol](https://docs.ag-ui.com) · [Generative UI in AG-UI](https://docs.ag-ui.com/concepts/generative-ui-specs)
- [Mastra](https://mastra.ai/docs)
