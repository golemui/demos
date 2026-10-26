# Hotel Concierge — Genkit × A2UI

> A booking agent that designs every form itself, with A2UI's v0.9 basic catalog, and relays what the guest types to the hotel API through server tools.

Type "We are 6 people and travel with a baby, need parking". The agent writes a
form for the stay (dates, guests, rooms, board, car), checks availability, then
writes one for the special requests it heard, a review card with the price, and
a card payment form. Each one is an A2UI surface: the components, their data
bindings, the validation checks and the buttons are all written by the model.
Google's Angular renderer draws them, and what the guest submits goes back to
the agent, which calls the hotel API with it.

**Built with Genkit · A2UI · Angular**

The same concierge with forms generated from the hotel's OpenAPI (GolemUI) is in
[genkit-hotel-booking-golemui](../genkit-hotel-booking-golemui), and both side by
side in [genkit-hotel-booking-compare](../genkit-hotel-booking-compare).

## What it shows off

- **Declarative generative UI with Genkit.** The `a2ui()` middleware of
  [`@genkit-ai/a2ui`](https://www.npmjs.com/package/@genkit-ai/a2ui) tells the
  model which components it may use, pulls the ```` ```a2ui ```` blocks out of
  its text, and streams them as data parts. The Angular app renders them with
  [`@a2ui/angular`](https://www.npmjs.com/package/@a2ui/angular).
- **The agent owns the whole flow.** It translates what its forms send back
  (their own shape: `"guests": "6"`, `"board": ["half"]`, split dates) into the
  API's shape, prices the booking (`quote_booking`), creates it
  (`create_booking`), changes it (`update_booking`) and charges it
  (`create_payment`), all through server tools.
- **The renderer → agent error path.** When the renderer rejects a surface, the
  app tells the agent why and asks it to render the surface again (at most twice
  per turn). Ask for "a slider for guests" to see it: the mock writes a `Slider`
  with `step`, which the basic catalog doesn't have, and the renderer rejects
  it (`Unrecognized key(s) in object: 'step'`). Real models make this kind of
  mistake: Claude has written `Slider.step`, which `@genkit-ai/a2ui`'s own
  description of the catalog advertises.
- **What crosses the wire.** The inspector lists every message between the
  browser and the agent, with its size: the A2UI the agent wrote, the actions
  sent back, and the server tools it called. The card form's whole context,
  card number included, goes to the agent: it keeps only the brand and last 4
  digits for the API because its instructions say so.
- **No database.** The agent has no store: the browser keeps the session and
  sends it on every turn, and the hotel API is an in-memory mock.

## Run it

Requires Node 20+.

```bash
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY
npm run dev               # Genkit server on :8000 + Angular app on http://localhost:4210
```

No API key, or offline? Run the scripted mock model instead. Only the LLM is
fake: it writes ```` ```a2ui ```` blocks like a model does, and the real
`a2ui()` middleware, the Genkit agent and the browser run unchanged.

```bash
npm run dev:mock
```

Other commands:

```bash
npm test            # pricing, mock API and catalog tests + the whole conversation over HTTP
npm run typecheck   # server tsc + Angular production build
```

## Changing a booking before paying

The contract has `PATCH /bookings/{bookingId}` (`updateBooking`): any booking
field, while the booking is unpaid; the server reprices it and re-checks
availability. Write "before paying, I want to rent a car": the agent designs a
form for the change and calls the `update_booking` server tool with what it
translated from it, on the same booking.

## How it works

```
shared/
  src/hotel-api.ts              ★ OpenAPI: createBooking (+ specialRequests), updateBooking, checkAvailability, createPayment
  src/contract.ts               request schemas read from the contract (the server tools' input schemas)
  src/pricing.ts                pricing + cross-field rules
  src/a2ui.ts                   the basic catalog's id (agent ⇄ renderer)
  src/normalize-envelopes.ts    repairs a misplaced "version" before the strict renderer
server/                         Genkit 1.43 (genkit/beta)
  src/agents.ts                 the defineAgent(), no store, with a2ui({ catalog: 'basic' }) and its server tools
  src/catalogs.ts               what the agent is told it may render
  src/basic-catalog.ts          the basic components, described from web_core's own schema
  src/mock-model.ts             MOCK_AGENT=1: a scripted model that writes A2UI blocks
  src/server.ts                 Express: /api/agent + the mock hotel API
app/                            Angular 21, zoneless
  src/app/agent/                remoteAgent() chat → A2UI envelopes → renderer, + renderer → agent repairs
  src/app/chat/                 the chat: bubbles, action chips, A2UI surfaces
  src/app/inspector/            the wire: A2UI sizes, actions, server tool calls
```

Files that start with an `AUTO-GENERATED from shared/hotel/…` banner are copies
of the hotel core this demo shares with the other hotel demos of the repo
(contract, pricing, mock API). They are complete and work as they are; in the
repo, they are edited in `shared/hotel/` and copied with `npm run sync`.

One turn, end to end:

1. The browser sends the message with `remoteAgent(...).chat().sendStream()`.
   The agent has no store, so the browser keeps the whole session and sends it
   on every turn.
2. The `a2ui()` middleware injects the catalog description into the system
   prompt, pulls the model's ```` ```a2ui ```` blocks out of its text, validates
   them against the catalog, and turns them into data parts.
3. The browser takes the envelopes out of the stream chunks
   (`a2uiEnvelopesFromParts`) and hands them to `A2uiRendererService`.
4. A click on a surface fires an A2UI action with its context resolved from the
   surface's data model. The browser sends it back as the next turn
   (`actionToMessage`), the middleware summarises it for the model as
   `[UI action "name" … context={…}]`, and the agent calls its server tools.

## Notes for A2UI / Genkit

- **Genkit:** interrupts and the Agents API exist only on `genkit/beta`.
  `import { genkit } from 'genkit'` leaves them undefined.
- **Genkit:** the `@genkit-ai/anthropic` plugin throws at startup without a key,
  so mock mode skips it. It has no headers option. `ANTHROPIC_WORKSPACE_ID` in
  `.env` is turned into the SDK's `ANTHROPIC_CUSTOM_HEADERS`.
- **`@genkit-ai/a2ui` 0.6:** its hand-written description of the basic catalog
  has drifted from the renderer. It advertises `Slider.step` and
  `List.listStyle`, which web_core's strict schemas reject, and omits
  `DateTimeInput`, `ChoicePicker` and `checks`. Here the model-facing
  description is **generated from web_core's own catalog.json**
  (`server/src/basic-catalog.ts`) and pinned by a test. The `validate` option of
  the `a2ui()` middleware only checks component names, so bad props reach the
  browser.
- **Models copy `version` into the wrong place.** On later turns the model sees
  its earlier surfaces in the history with the plugin's top-level `version`, and
  sometimes writes one inside `updateComponents`. The strict renderer rejects
  that ("Unrecognized key(s) in object: 'version'"). The agent is told never to
  write `version`, and the app strips a misplaced one before rendering
  (`shared/src/normalize-envelopes.ts`, tested against web_core).
- **web_core 0.14:** the `numeric` check rejects strings with `EXPRESSION_ERROR`,
  but a `TextField` (even `variant: number`) stores strings. A `numeric` check
  on a TextField can never pass, so the mock uses `regex` instead.
- **`@a2ui/angular` 0.13 (v0_9):** `ChoicePicker` ignores its `label`, and only
  TextField and Slider show check messages. Disabled buttons use fixed light
  colors that don't follow the theme.
- **`@a2ui/angular` 0.13:** requires Angular `^21.2.5`, so this demo isn't on
  Angular 22.
- **Angular dev server:** `@hotel/shared` is excluded from Vite's dependency
  prebundling (`angular.json`); prebundling the workspace package fails to
  resolve its TypeScript sources.

The page chrome (header, theme toggle, Clay colors) is the repo's demo shell,
which uses GolemUI's theme stylesheet; the chat itself uses no GolemUI.

## Learn more

- [A2UI](https://a2ui.org) · [Genkit](https://genkit.dev) · [@genkit-ai/a2ui](https://www.npmjs.com/package/@genkit-ai/a2ui)
