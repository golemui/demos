# AG-UI × GolemUI — guided hotel booking (with an agent harness)

A conversational hotel-booking agent that drives real **GolemUI** forms through the
**[AG-UI protocol](https://docs.ag-ui.com)** — and an **agent harness** that supervises
what the agent wants to execute.

The guest chats with a hotel concierge ("book a room for 2 people next week"). Instead of
asking field by field, the agent renders forms inline in the chat, prices the stay in
host code, and asks for confirmation before anything is committed. The demo shows both
directions of the human↔agent contract:

1. **The agent asks the guest** (`render_form`, generative UI). Two LLM-authored GolemUI
   forms, validated server-side before they reach the browser and pre-filled from the
   conversation: the **stay** (an arrival→departure range picker capped at 30 nights by
   a host handler, guests 1–4, board), the **car question** (with the agent's suggestion
   pre-selected), and — only if the guest says yes — the **car type**. The branching
   between forms is done by the agent itself.
2. **The guest supervises the agent** (`confirm_booking`, the harness). The agent proposes
   the booking as a tool call; the app derives an **editable review form from the tool's
   JSON Schema**, pre-fills it with the proposal, and shows a **host-computed price
   breakdown** above it. The guest can edit any field (the schema's constraints validate
   the edits too), confirm, or reject. The tool result reports **the diff between what the
   agent proposed and what the guest confirmed**, plus the recomputed total — so the agent
   acknowledges the change.

3. **A hand-crafted surface for the tool that deserves one** (`collect_payment`). After
   confirmation the agent charges the total — and the app renders an animated card
   checkout: GSAP 3D card that mirrors the inputs live, brand detection, Luhn/expiry/CVC
   validation via `card-validator`, all declared with the **TypeScript `gui.*` API** and
   custom Angular widgets ([`payment/`](app/src/app/payment/)). The definition is the
   same data the React credit-card demo uses — only the widget loaders point at Angular
   components. Card details never reach the agent: the tool result is brand + last4.

Note the asymmetry — it's the whole point: in step 1 the LLM authors the form definition
(so it must be validated, with retries); in step 2 the definition is derived
deterministically from the tool's schema and the LLM only supplies the *values*; in
step 3 the definition is hand-written by the app and the LLM only decides when to
invoke it. And the price is **never computed by the LLM** — `pricing.ts` is a pure host
function; the agent only proposes selections.

There is **no `@golemui/ag-ui` package (yet)** — all bridge logic lives in
[`app/src/app/agui/`](app/src/app/agui/), isolated so it can be extracted later. The
[Findings](#findings-for-a-future-golemuiag-ui-package) section is the design input for it.

## The three acts

### Act 1 — generative UI (`render_form`)

- **`render_form` is a frontend tool** (standard AG-UI human-in-the-loop pattern): the app
  declares it; its description carries a condensed GolemUI JSON authoring guide
  ([`render-form-tool.ts`](app/src/app/agui/render-form-tool.ts)).
- **The server validates every definition** with the real GolemUI validator
  (`validateFormDefinition` from `@golemui/gui-mcp/json` — the same code behind the
  `json_validate_form_definition` MCP tool) before the tool call reaches the browser.
  Invalid definitions are fed back to the model as tool errors for self-correction.
- Scenario knowledge (which fields, which host handlers exist) lives in the agent's system
  prompt ([`agent.ts`](agent/src/agent.ts)); the bridge stays generic.
- **Host handlers by name.** The stay range picker's selectable window is capped at 30
  nights from the chosen arrival by the app's `datesChanged` handler
  ([`booking-form-events.ts`](app/src/app/booking/booking-form-events.ts)), wired to the
  widget's `on.change` — the LLM never hard-codes the business rule.
- **The agent does the branching.** Whether the car-type form appears at all is decided
  by the agent from the car question's result — deliberately NOT with in-form
  conditional visibility (see finding 4).

### Act 2 — the harness (`confirm_booking`)

```
agent proposes            confirm_booking { dates: [{start, end}], guests, board, car }
        │
        ▼
agui/harness.ts           tool JSON Schema ──► GolemUI form definition
agui/ToolApprovalComponent    ├─ pre-filled with the agent's proposed values
                              └─ host price breakdown (pricing.ts) shown above the fields
        │
        ▼
guest                     edits board half → full (schema validators apply), confirms
        │                 — or rejects, and nothing runs
        ▼
booking/booking-tools.ts  execute(data) → prices the final selection      (host code)
        │
        ▼
tool result               { status: "approved",
                            humanChanges: [{ path: "board", proposed: "half", approved: "full" }],
                            result: { bookingId, total: 300 } }
        │
        ▼
agent                     "Booking BKG-2026-… confirmed — total €300. I've applied your
                           change (board: half → full)."
```

- **One generic surface for any tool.** [`harness.ts`](app/src/app/agui/harness.ts) maps
  JSON Schema properties to GolemUI widgets (`oneOf`→labelled select, `enum`→select,
  `boolean`→checkbox, `number`→number, `date`→datePicker, a date-range array
  `[{ start, end }]`→rangeDatePicker, long `string`→textarea, nested objects→dot-paths) and schema constraints (`required`, `minimum`/`maximum`,
  `minLength`/`maxLength`) to GolemUI validators. No approval UI is hand-written per tool.
- **The schema is the policy.** `guests.maximum: 4` bounds the agent's proposal AND the
  guest's edit, in the same place.
- **The math is host code, and it's live.** The price breakdown is computed by
  `priceBooking` ([`pricing.ts`](app/src/app/booking/pricing.ts)) — a pure function —
  shown above the fields and **recomputed on every edit**: switch to full board and the
  total updates from €260 to €300 before you confirm. The LLM never does arithmetic; it
  proposes selections, the app prices them. (To keep the live recompute working around
  engine finding 4, the approval form validates on submit — invalid edits are still
  blocked, with inline errors, when the guest hits Confirm.)
- **The diff is the feedback loop.** `humanChanges` tells the agent how its proposal was
  corrected, not just that it was accepted — context it uses for the rest of the chat.
- Registering a new supervised action is app-side only: write a schema + an `execute`
  function (and optionally a `summary`), register it on the page — the bridge does the rest
  ([`booking-tools.ts`](app/src/app/booking/booking-tools.ts)).

### Act 3 — the hand-crafted surface (`collect_payment`)

- The checkout is the React credit-card demo ported to Angular:
  [`payment/checkout-form.ts`](app/src/app/payment/checkout-form.ts) is the same `gui.*`
  definition (runtime-function props for the live card, brand-aware CVV validator,
  submit gated on whole-form validity) with `customWidgetLoaders` resolving Angular
  components instead of React ones. The custom validators (Zod + `card-validator`) are
  copied verbatim — they are framework-agnostic by design.
- **Custom Angular widget contract**: a component with a public `widget` property that
  injects `InputWidgetAdapter`/`DisplayWidgetAdapter` (own `providers`), calls
  `adapter.init(this.widget)` in `ngOnInit`, and renders from the `templateData()`
  signal. Loaders return the component class: `cardNumber: async () => CardNumberInputComponent`.
- GolemUI has no `onFocus` hook, so the CVV-focus card flip is shared through a
  module-level Angular signal ([`flip-store.ts`](app/src/app/payment/flip-store.ts)) —
  same workaround as the React demo's external store.
- The chat panel renders this surface directly for `collect_payment` calls — a package
  needs a registry story for custom tool surfaces (see findings).

## Rate card

Per night: room €60, +€10 per guest, half board +€10/guest, full board +€20/guest; car:
sports +€45, compact +€25, SUV +€30. Rooms sleep up to 4; stays up to 30 nights. All of
this lives in one pure function, [`pricing.ts`](app/src/app/booking/pricing.ts).

## Setup

Requires Node 20+.

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-…   # https://platform.claude.com
npm run dev                          # agent server on :8000 + Angular app on :4200
```

No API key at hand? Run the deterministic mock agent instead (same protocol, canned
responses, the full round trip still works):

```bash
npm run dev:mock
```

Other commands:

```bash
npm test              # unit tests for the server-side form validation
npm run typecheck     # agent tsc + app production build
npm run e2e           # browser E2E of the whole flow (use dev:mock; needs Chrome)
```

## Manual walkthrough

1. Open http://localhost:4200 and send **“Book a room for 2 people next week”**
   (there's a suggestion button).
2. A **stay form** appears inline, pre-filled (a `rangeDatePicker` with
   arrival→departure a week out, 2 guests). The app's `datesChanged` handler caps the
   selectable range at 30 nights from the chosen arrival. Pick a **board** option and
   click **Continue**.
3. A **car question** appears with the agent's suggestion pre-selected (**Yes, add a
   car**). Click **Continue** → the agent branches and sends a **car type** form
   (answer **No** instead and it skips straight to the review). Pick a car and click
   **Review booking**. The branching deliberately lives in the agent, not in
   conditional visibility — see finding 4.
4. The agent proposes the booking: an **Approval required** card shows a **price
   breakdown** (host-computed) above a review form derived from the `confirm_booking`
   JSON Schema, pre-filled with the proposal.
5. Edit **Board** to **Full board** and click **Confirm booking**. The card collapses to
   “Approved” with the field-level diff, and the agent's reply gives the booking id, the
   **recomputed total (€300)**, and acknowledges your change (`board: half → full`).
6. Alternatively click **Reject** — nothing executes and the agent asks what to change.
7. The agent then charges the total: the **animated card checkout** appears
   (`collect_payment`). Type a card — try 4242 4242 4242 4242 — and watch the 3D card
   mirror every keystroke, the VISA badge appear, and the card flip when you focus the
   CVC. The Pay button enables only when everything passes `card-validator`. Pay →
   GSAP success check → the agent confirms "€X on your visa ending 4242".
8. **Invalid-definition retry path:** edit the guide example in
   [`render-form-tool.ts`](app/src/app/agui/render-form-tool.ts) to use a bad widget type
   and ask the model to copy it verbatim — the server logs
   `render_form validation failed (attempt 1/3)` and the model ships a corrected
   definition next attempt. (`validate.test.ts` covers the validator itself.)

## Repo layout

```
agent/                       AG-UI server — no agent framework, ~3 files
  src/server.ts              POST /awp → SSE stream of AG-UI events (@ag-ui/encoder)
  src/agent.ts               Anthropic loop, AG-UI⇄Anthropic mapping, render_form
                             validation + self-correction retry, hotel system prompt
  src/validate.ts            GolemUI validation via @golemui/gui-mcp/json
  src/mock.ts                MOCK_AGENT=1 — canned agent (stay → car → confirm → payment)
app/
  src/app/agui/              ★ the future @golemui/ag-ui seed — everything AG-UI-specific
    render-form-tool.ts      render_form Tool + condensed GolemUI authoring guide
    agui-client.service.ts   HttpAgent wrapper (messages/running/error as signals)
    form-tool.component.ts   render_form tool call → GuiFormInitConfig → <gui-form>
    harness.ts               ★ JSON Schema → GolemUI form def, proposal/approval diff,
                             host summary type
    tool-approval.component.ts  supervised tool call → pre-filled approval form + summary
  src/app/booking/           the hotel scenario (host-owned)
    pricing.ts               pure price function + labelled summary (the money math)
    booking-tools.ts         confirm_booking schema + execute + summary (harness registration)
    booking-form-events.ts   datesChanged handler (departure range follows arrival)
    booking-page.component.ts host page; registers the supervised tools
  src/app/payment/           ★ act 3 — animated card checkout (gui.* TS API, custom
                             Angular widgets + adapters, GSAP, card-validator, Zod)
  src/app/chat/              chat panel UI (renders all three tool surfaces)
scripts/e2e.mjs              puppeteer E2E of the whole flow (mock agent)
```

## Findings for a future `@golemui/ag-ui` package

Friction points and design input collected while building this.

1. **Schema→form is the core primitive.** `schemaToFormDef` covers the JSON Schema subset
   LLM tool definitions actually use (flat + nested objects, `enum`, `oneOf`/`const` for
   labelled options, numeric/string bounds, `format: date`) in ~150 lines, and the result
   needs no runtime validation because it's derived, not authored. A packaged version
   should add per-field UI hints (widget override, currency, readonly) without letting
   hints leak into the wire schema.

2. **Validator message keys differ by data type.** A `number`/`boolean` validator's
   `messages` object rejects a `required` key (only `string` accepts it); all types accept
   `invalid`. `schemaToFormDef` encodes this. A packaged helper must too, or agent- and
   schema-authored forms fail validation intermittently.

3. **`markdownText` in a JSON definition uses `props.md`, and the runtime widget is
   flaky.** The JSON display type is `markdownText` with a required `props.md` (not
   `text`), but in `@golemui/gui-angular` 1.2.1 mounting it inside a live form rendered
   empty and logged an internal error. The demo therefore renders the price breakdown in
   the Angular component itself (from the host `summary` fn) rather than as a GolemUI
   display. A package should either fix the JSON markdown widget or expose a first-class
   "summary/annotation" slot on the approval surface.

4. **Reactivity breaks in every gui-form after the first one in a thread (the big
   one).** In a chat where `<gui-form>` instances accumulate (each render_form call
   mounts one; completed ones are destroyed), any value change in a later form throws
   `TypeError: Cannot read properties of undefined (reading 'source')` inside the
   `ATTEMPT_VALIDATION` reducer (`calculatedWidgets[uid]` lookup fails), and that aborts
   the reactive pipeline: `include`/`exclude` toggling and `disabled: { when: … }`
   re-evaluation silently stop working in that form. Reproduced on 1.2.1 AND 1.3.0; the
   same form as the *first* form of the page works perfectly. Neither unique `formName`s,
   keeping completed forms mounted-but-hidden, host `on.change` handlers, nor validators
   on the conditional widget fix it. Consequences for agent-driven UIs (which are
   *always* multi-form threads): expressions evaluated at mount (pre-filled data) work;
   anything that must *react to user edits* in a second-or-later form does not. The
   demo's workaround: **the agent does the branching** — the car question and the car
   type are two small sequential forms, and the authoring guide now forbids
   change-driven conditional visibility (allowed only when decided by pre-filled data at
   open). This needs an engine fix before a `@golemui/ag-ui` package ships.
   **The crash also swallows host `formEvent`s** in later forms (the `on.change` emit
   dies in the same pipeline), which killed the live price recompute — until the
   approval form switched to `validateOn: 'submit'`: skipping change-validation
   sidesteps the crash and `__changed` events reach the host again, so the breakdown
   now tracks edits live. Cost: field errors in the approval form surface at submit
   instead of while typing (submit still blocks invalid data).
   **Sharper scope, from act 3**: RUNTIME-FUNCTION definitions are NOT affected — the
   payment checkout is the 6th gui-form of the thread and its function-driven widgets
   (card preview props reading $form, the brand-aware CVV validator, the Pay button's
   `disabled`) re-evaluate on every keystroke, flawlessly. The break is specific to the
   *declarative* reactive layer (`include`/`exclude`/`states`/`disabled: { when }`);
   the *functional* reactive layer survives. That asymmetry should sharply narrow where
   to look in the engine.

5. **`formEvent` only fires for widgets with an `on` handler.** To recompute a live host
   summary as the guest edits a schema-derived form, `schemaToFormDef` attaches
   `on: { change: … }` to each input. (Programmatic `page.select` in the E2E doesn't
   trigger it, so the breakdown there reflects the proposal; real edits and the recomputed
   total on confirm are what the flow guarantees.)

5b. **`datePicker` collapses inside a flex row.** Two datePickers in a
    `layout/flex { direction: "row" }` render at zero width and overlap
    (`@golemui/gui-angular` 1.2.1), with or without child `size`. Stacked at the top
    level they render full-width and fine. The authoring guide now forbids datePickers
    inside flex rows; `schemaToFormDef` never emits layouts, so schema-derived forms are
    unaffected. (The demo now uses one `rangeDatePicker` for arrival→departure anyway —
    better UX and no layout needed.)

5c. **Range date widgets: the value is an ARRAY OF RANGE OBJECTS
    `[{ start, end }]`.** The JSON types are `rangeDateInput` (no `minDate`/`maxDate`
    props) and `rangeDatePicker` (accepts them). The widget supports multiple ranges —
    each renders as a removable pill — so pre-fill with
    `[{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }]`. Wrong shapes are nasty traps:
    a bare object `{ start, end }` renders empty, and an array of strings renders
    "undefined - undefined" pills — in both cases the bogus value still flows through
    untouched to the submitted data. Validate with `{ "type": "array",
    "required": true }` (only an `invalid` message key). The authoring guide now
    documents the shape.

6. **Server-side validation is a first-class citizen.** `@golemui/gui-mcp` exposes a
   runtime-portable `./json` entry (`validateFormDefinition`, synchronous) with
   LLM-oriented messages — ideal for validate-and-retry. Treat `warnings` (likely-custom
   widget types) as blocking when the host only ships built-ins.

7. **Buffer tool args until `TOOL_CALL_END`.** A GolemUI form can't render progressively
   from streamed `TOOL_CALL_ARGS` deltas — replacing `config` re-initializes the form. The
   server validates first and emits args as a single chunk; a client bridge must likewise
   mount only once the call is complete.

8. **`formSubmit` only fires when valid — the bridge can trust `event.data`** and forward
   it (as tool result, or diff it against the proposal) without re-checking.

9. **AG-UI client does the heavy lifting.** `HttpAgent` (`@ag-ui/client@0.0.57`) maintains
   the conversation and applies `TOOL_CALL_*` events; per-run `tools` let the app register
   supervised tools on top of `render_form`. The Angular service is ~90 lines.

10. **Per-widget lazy loading meets dev-server dep optimizers.** `@golemui/gui-angular`
    dynamically imports one chunk per widget type; under `ng serve` (Vite) a mid-session
    re-optimization invalidates those chunk URLs (`504 Outdated Optimize Dep` → GolemUI
    `[30] Widget "X" could not be loaded`). The app pins
    `prebundle: { exclude: ["@golemui/gui-angular"] }` in
    [`angular.json`](app/angular.json). If you still hit it: stop the dev server,
    `rm -rf app/.angular`, restart. Production builds are unaffected.

11. **Custom widgets port 1:1 across frameworks — the definition really is portable.**
    The React credit-card checkout's `gui.*` definition, Zod/card-validator custom
    validators, and brand logic moved to Angular unchanged; only the five widget
    components were rewritten (React hooks → `InputWidgetAdapter`/`DisplayWidgetAdapter`
    + `templateData()` signal). The Angular custom-widget contract is undocumented but
    clean: public `widget` property (assigned by the host), adapter in `providers`,
    `adapter.init(this.widget)` in `ngOnInit`, loaders return the component class.
    Two package wants: document that contract, and add an `onFocus` event hook (the
    CVV-focus card flip needs an out-of-band shared signal today — same gap in both
    frameworks).

12. **Custom tool surfaces need a registry.** The demo now has three kinds of tool
    rendering: LLM-authored forms (render_form), schema-derived approvals (harness
    registry), and a hand-crafted checkout — and the third is wired by a direct import
    in the chat panel. A package should let the host register
    `{ toolName → component }` custom surfaces next to the harness registry, so the
    chat/bridge layer stays generic.

13. **Not covered here (stretch goals):** agent-driven `STATE_DELTA` patches into a
    rendered form, `INJECT_VALIDATION_ISSUES` from an agent-side review of submitted data,
    multiple concurrent forms per thread, AG-UI `interrupts` (0.0.57) as an alternative to
    the tool-call-without-result pattern, and a shared browser-safe `toolToFormDef` also
    exposed as an MCP tool for dev-time scaffolding.

## Versions

`@golemui/*` 1.2.1 · `@ag-ui/*` 0.0.57 (pinned exactly — pre-1.0) · Angular ^20.3 ·
`@anthropic-ai/sdk` with `claude-sonnet-5` (override with `AGENT_MODEL`).
