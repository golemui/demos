# AG-UI × GolemUI — insurance claims agent

An AI agent that drives a real **GolemUI** form through the **[AG-UI protocol](https://docs.ag-ui.com)**.

The user chats with an insurance assistant ("my bike was stolen in Amsterdam yesterday").
Instead of asking field by field, the agent emits a `render_form` tool call whose argument
is a **GolemUI JSON form definition**. The frontend validates nothing itself — the server
already did — and mounts a live `<gui-form>` inline in the chat, pre-filled with everything
the user already said. On submit, the validated form data is returned to the agent as the
tool result, and the agent confirms the claim in chat.

There is **no `@golemui/ag-ui` package (yet)** — all bridge logic lives in
[`app/src/app/agui/`](app/src/app/agui/), isolated so it can be extracted later.
The [Findings](#findings-for-a-future-golemuiag-ui-package) section below is the
design input for that package.

## Architecture

```
┌─────────────────────────── Angular app (:4200) ───────────────────────────┐
│  chat/ChatPanel ──► agui/AguiClientService (AG-UI HttpAgent)              │
│       │                       │  POST /awp  { messages, tools: [render_form], … }
│       │                       ▼
│       │             ┌──── agent server (:8000) ─────────────────────────┐ │
│       │             │ RUN_STARTED                                       │ │
│       │             │ TEXT_MESSAGE_* ◄── Anthropic (claude-sonnet-5)    │ │
│       │             │ TOOL_CALL_*    ◄── render_form args, but only     │ │
│       │             │ RUN_FINISHED       after validate.ts passes;      │ │
│       │             │                    invalid defs loop back to the  │ │
│       │             │                    model as tool errors (max 2×)  │ │
│       │             └───────────────────────────────────────────────────┘ │
│       ▼                                                                   │
│  agui/FormToolComponent ──► <gui-form> (@golemui/gui-angular)             │
│       │  (formSubmit) → tool-result message → next run → confirmation     │
│       └─ (formEvent)  → claims/claim-form-events.ts (countryChanged →     │
│                         OVERRIDE_WIDGET_PROP loads city options locally)  │
└───────────────────────────────────────────────────────────────────────────┘
```

- **`render_form` is a frontend tool** (standard AG-UI human-in-the-loop pattern): the app
  declares it in `RunAgentInput.tools`; its description carries a condensed GolemUI JSON
  authoring guide ([`render-form-tool.ts`](app/src/app/agui/render-form-tool.ts)).
- **The server validates every definition** with the real GolemUI validator
  (`validateFormDefinition` from `@golemui/gui-mcp/json` — the same code behind the
  `json_validate_form_definition` MCP tool) before the tool call ever reaches the browser.
  Invalid definitions are fed back to Claude as tool errors for self-correction.
- **The tool result arrives in the next run**: the frontend appends a `role: "tool"` message
  with the submitted data and runs the agent again, which confirms the claim.
- Scenario knowledge (claim fields, available host event handlers, pre-fill rules) lives in
  the server's system prompt ([`agent.ts`](agent/src/agent.ts)); the bridge stays generic.

## Setup

Requires Node 20+.

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-…   # https://platform.claude.com
npm run dev                          # agent server on :8000 + Angular app on :4200
```

No API key at hand? Run the deterministic mock agent instead (same protocol, canned
responses, the full form round trip still works):

```bash
npm run dev:mock
```

Other commands:

```bash
npm test              # unit tests for the server-side form validation
npm run typecheck     # agent tsc + app production build
npm run e2e           # browser E2E against the running app (use dev:mock; needs Chrome)
```

## Manual E2E script

1. Open http://localhost:4200 and send **“My bike was stolen in Amsterdam yesterday”**
   (there's a suggestion button for it).
2. The assistant streams a short reply, then a claim form appears inline in the chat:
   - **Date of incident** pre-filled with yesterday, **Country** = Netherlands,
     **City** = Amsterdam (its options were loaded by the app's `countryChanged`
     handler at form load — not by the LLM).
   - Because the country is not Spain, a conditional info alert and a required
     **Police report number** field are visible (`include: { in: ["abroad"] }` driven by a
     named state). Switch the country to **Spain** — both disappear; the city options
     change to Spanish cities.
3. Submit with an empty description → inline validation errors, no submit event fires.
4. Fill a description (≥ 20 chars) and a police report number, click **Submit claim** →
   the form collapses to “Form submitted — thanks!” and the agent streams a confirmation
   with a claim id (`CLM-2026-XXXX`) and next steps.
5. Testing the **invalid-definition retry path**: edit
   [`render-form-tool.ts`](app/src/app/agui/render-form-tool.ts) and change a widget type in
   the guide's example (e.g. `"textinput"` → `"textbox"`), then ask the model to copy the
   example verbatim — the server logs
   `render_form validation failed (attempt 1/3)` with the validator report, and the model
   ships a corrected definition on the next attempt. (`validate.test.ts` covers the
   validator itself.)

## Troubleshooting

**`GolemUI form error: [30] Widget "flex" could not be loaded` (or any widget), with
`Failed to load resource: 504 (Outdated Optimize Dep)` in the console** — this is the
`ng serve` (Vite) dependency optimizer, not GolemUI: `@golemui/gui-angular` lazy-loads one
chunk per widget type, and if Vite re-optimizes dependencies mid-session (stale cache,
`npm install` while the server runs, two dev servers sharing one cache), the already-open
page keeps requesting outdated chunk URLs and every widget load fails until a clean
reload. The app pins `prebundle: { "exclude": ["@golemui/gui-angular"] }` in
[`angular.json`](app/angular.json) serve options so widget chunks bypass the optimizer
entirely. If you still hit it: stop the dev server, `rm -rf app/.angular`, restart.
Production builds are unaffected.

## Repo layout

```
agent/                       AG-UI server — no agent framework, ~3 files
  src/server.ts              POST /awp → SSE stream of AG-UI events (@ag-ui/encoder)
  src/agent.ts               Anthropic messages loop, AG-UI⇄Anthropic message mapping,
                             render_form validation + self-correction retry
  src/validate.ts            GolemUI validation via @golemui/gui-mcp/json
  src/mock.ts                MOCK_AGENT=1 — canned agent, no API key needed
app/
  src/app/agui/              ★ the future @golemui/ag-ui seed — everything AG-UI-specific
    render-form-tool.ts      render_form Tool + condensed GolemUI authoring guide
    agui-client.service.ts   HttpAgent wrapper (messages/running/error as signals)
    form-tool.component.ts   render_form tool call → GuiFormInitConfig → <gui-form>
  src/app/chat/              chat panel UI (generic)
  src/app/claims/            host page + GolemUI form event handlers (city loading)
scripts/e2e.mjs              puppeteer E2E of the whole loop (mock agent)
```

## Findings for a future `@golemui/ag-ui` package

Friction points and design input collected while building this, roughly ordered by impact.

1. **`formDef` accepts the whole JSON document — but only the JSON flavor does.**
   `GuiFormInitConfig.formDef` is `string | Record<string, any> | DxDefinitions`. For JSON
   definitions you pass the entire `{ form: [...], states?: {...} }` document; for the TS
   `gui.*` flavor, `formDef` must be the bare widget array with `states` in the sibling
   `formConfig`. Passing the bare array of a *JSON* document fails at runtime with
   `GolemUI form failed to initialize: [22] form: Expected object literal, got "undefined"`
   — console-only; the component renders empty. The package should normalize both shapes
   (and surface init errors through an output, not just the console).

2. **Server-side validation is a first-class citizen already.** `@golemui/gui-mcp`
   exposes a runtime-portable `./json` entry (`validateFormDefinition`, synchronous, no MCP
   server needed) with LLM-oriented error messages and fix suggestions — ideal for the
   validate-and-retry loop. Two nuances a package helper should encode: treat `warnings`
   (likely-custom widget types) as blocking when the host only ships built-in widgets, and
   forward `expressionWarnings` as advisory context.

3. **Buffer tool args until `TOOL_CALL_END`.** A GolemUI form can't render progressively
   from streamed `TOOL_CALL_ARGS` deltas — replacing `config` re-initializes the whole
   form. The server therefore validates first and emits the args as a single chunk; a
   client-side bridge must likewise only mount the form once the call is complete.

4. **The tool description doubles as the authoring guide — and it's enough.** A ~70-line
   condensed guide (widget shapes, validator `messages` rules, `include`/states, `on`
   events) plus server-side retry produced valid definitions reliably. The package could
   ship this guide as an exported constant, parameterized by the widget subset the host
   allows.

5. **Host event handlers need a discovery story.** GolemUI's by-name event contract
   (`on: { change: "countryChanged" }` → host function) maps perfectly onto AG-UI, but the
   LLM must be told which handler names exist and what they do — today via system prompt.
   A package could register handlers as `{ name, description, handler }` and generate that
   section of the tool description automatically.

6. **Pre-fill × async options: wire `on.load` to the same handler as `on.change`.**
   A select whose options the host loads (city) renders a pre-filled value with an empty
   options list unless the definition also declares `on: { load: sameHandler }` — handlers
   read the current data (including the pre-filled country) and `OVERRIDE_WIDGET_PROP` the
   options at mount. Non-obvious authoring rule; belongs in the packaged guide (it's in
   ours).

7. **Prop-name asymmetry in `OVERRIDE_WIDGET_PROP`.** `select` takes `options`, `dropdown`
   takes `items` — a host handler must know the widget type it targets. A future helper
   like `setChoices(path, list)` could abstract that.

8. **`formSubmit` only fires when valid — the bridge can trust `event.data`** and forward
   it as the tool result without re-checking. Client-side, GolemUI's pristine-form gap
   (nothing validates at mount) is invisible to this flow, since submit always validates.

9. **AG-UI client does the heavy lifting.** `HttpAgent` (`@ag-ui/client@0.0.57`) maintains
   the conversation (`agent.messages`), applies `TOOL_CALL_*` events into
   `assistantMessage.toolCalls`, and takes per-run `tools`. The whole Angular service is
   ~80 lines; a framework-agnostic bridge core is realistic. Divergences from the docs
   were minor: the SSE encoder is `@ag-ui/encoder`'s `EventEncoder#encodeSSE` (docs show
   the Python `ag_ui` package), and the TS types are the source of truth for
   `RunAgentInput`/`Tool`/`ToolCall` shapes.

10. **AG-UI `interrupts` may fit forms even better than frontend tools.** 0.0.57 ships an
    interrupt mechanism (`RunFinishedEvent.outcome.type === "interrupt"`, `Interrupt`,
    `resume` entries on the next run) that models "the run pauses until a human provides
    structured input" more directly than the tool-call-without-result pattern used here
    (which is what the AG-UI docs recommend today). Worth evaluating once it stabilizes.

11. **Per-widget lazy loading meets dev-server dep optimizers.** `@golemui/gui-angular`
    dynamically imports one chunk per widget type. Under `ng serve` (Vite), a mid-session
    dependency re-optimization invalidates those chunk URLs and the failure surfaces as
    GolemUI's `[30] Widget "X" could not be loaded` — the real cause (`504 Outdated
    Optimize Dep`) is only visible in the network/console log. Agent-driven forms make
    this *more* likely than hand-written ones, because which widget chunks load — and
    when — depends on whatever the LLM authors at runtime. The package docs should ship
    the `prebundle: { exclude: ["@golemui/gui-angular"] }` guidance (see Troubleshooting).

12. **Not covered here (stretch goals for the package):** agent-driven `STATE_DELTA`
    patches into a rendered form, `INJECT_VALIDATION_ISSUES` driven by an agent-side
    review of submitted data, multiple concurrent forms per thread, and streaming
    partial pre-fill.

## Versions

`@golemui/*` 1.2.1 · `@ag-ui/*` 0.0.57 (pinned exactly — pre-1.0) · Angular ^20.3
(`@golemui/gui-angular` 1.2.x has a known dropdown issue on Angular 22) ·
`@anthropic-ai/sdk` with `claude-sonnet-5` (override with `AGENT_MODEL`).
