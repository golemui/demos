import type { Tool } from '@ag-ui/core';

/**
 * The `render_form` frontend tool, declared on every AG-UI run.
 *
 * Its description doubles as a condensed GolemUI JSON-authoring guide for the
 * LLM. The agent server validates every emitted definition with the real
 * GolemUI validator before it reaches the browser, so the guide only needs to
 * get the model close — validation errors are fed back for self-correction.
 *
 * Scenario-specific knowledge (which fields to use, which host event handlers
 * exist) intentionally does NOT live here: the application's agent supplies it
 * in its system prompt. This file is scenario-neutral on purpose — it is the
 * seed of a future `@golemui/ag-ui` package.
 */
export const RENDER_FORM_TOOL: Tool = {
  name: 'render_form',
  description: `Render an interactive GolemUI form inline in the chat. Call this whenever you need structured input from the user instead of asking field by field. The user fills in and submits the form; this tool's result is the validated form data as JSON.

ARGUMENTS
- formDef (required): a GolemUI form definition, a JSON object shaped:
  { "form": [ ...widgets ], "states": { "<name>": "<expression>" } }  ("states" is optional)
- data (optional): initial form data. Pre-fill EVERY value already known from the conversation, keyed by the widget paths, e.g. { "incident": { "country": "NL" } }.

WIDGETS — every widget has "kind" and "type"; input widgets also have "path" (a dot-path into the form data, e.g. "incident.date") and usually "label". Widget-specific options go under "props". Use ONLY these widgets:
- Text: { "kind": "input", "type": "textinput", "path": "...", "label": "...", "props": { "placeholder"?, "hint"?, "icon"? } }
- Long text: { "kind": "input", "type": "textarea", "path": "...", "label": "...", "props": { "placeholder"?, "minimumHeight"?: 120, "autoGrow"?: true, "maxLength"? } }
- Single choice: { "kind": "input", "type": "select", "path": "...", "label": "...", "props": { "options": [ { "label": "Spain", "value": "ES" }, ... ], "placeholder"? } }
- Date: { "kind": "input", "type": "datePicker", "path": "...", "label": "...", "props": { "minDate"?: "YYYY-MM-DD", "maxDate"?: "YYYY-MM-DD" } }
- Date range (two dates in one widget, e.g. arrival→departure): { "kind": "input", "type": "rangeDatePicker", "path": "...", "label": "...", "props": { "minDate"?, "maxDate"? } } — its DATA value is an ARRAY OF RANGE OBJECTS [{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }] (usually one entry); pre-fill it that way and validate it with { "type": "array", "required": true }. Prefer this over two separate date fields for any period.
- Checkbox: { "kind": "input", "type": "checkbox", "path": "...", "label": "..." }
- Number: { "kind": "input", "type": "number", "path": "...", "label": "..." }
- Static notice (no path): { "kind": "display", "type": "alert", "props": { "text": "...", "level": "info" | "warning" | "error" | "success" } }
- Row of fields (no path): { "kind": "layout", "type": "flex", "props": { "direction": "row", "gap": 12 }, "children": [ ...widgets ] } — groups two or three short related fields side by side; use sparingly. NEVER place datePicker widgets inside a flex row (they collapse to zero width) — always declare date fields at the top level, stacked.
- Submit: { "kind": "action", "type": "button", "actionType": "submit", "label": "..." } — every form MUST end with exactly one submit button.

VALIDATORS — "validator" is a root key on input widgets:
  "validator": { "type": "string", "required": true, "minLength": 20, "messages": { ... } }
- "type" is the DATA type of the value: "string" (also for select values and dates), "number", "boolean", "array".
- Rules: "required", "minLength"/"maxLength" (strings), "pattern", "format" ("email", "url", "date", ...), "minimum"/"maximum" (numbers).
- Write user-facing "messages" for every rule you use. When "required": true, ALWAYS set BOTH "messages.required" AND "messages.invalid" to the same text — an untouched empty field shows the "invalid" message, not the "required" one.

CONDITIONAL VISIBILITY
- Declare named states at the root: "states": { "abroad": "$form.incident?.country !== undefined && $form.incident?.country !== 'ES'" }
- Expressions reference $form (the live form data). Use optional chaining ("?.") for nested paths and strict operators (===, !==, &&, ||).
- Show a widget only while a state is active with the root key "include": { "in": ["abroad"] }; hide it with "exclude": { "from": ["abroad"] }.
- For a one-off condition on a single widget use "include": { "when": "$form.x === 'y'" } instead of a named state.
- RELIABILITY RULE: only use include/exclude when the condition is already decided by PRE-FILLED data at form open. For branching that depends on what the user picks INSIDE the form (e.g. "if they answer yes, ask which one"), do NOT use conditional visibility — split it into two small sequential forms and do the branching yourself from the first form's result.

EVENTS — "on" is a root key mapping widget events ("change", "load", "click", "blur", "filter") to HOST handler names implemented by the application:
  "on": { "change": "countryChanged" }
Only reference handler names the application has told you about. A select whose options the application loads at runtime should ship "props": { "options": [] } with a placeholder, plus "on": { "load": "<handler>" } so the options are also loaded when the form opens pre-filled.

EXAMPLE (all constructs together):
{
  "states": { "isCompany": "$form.customer?.type === 'company'" },
  "form": [
    { "kind": "input", "type": "select", "path": "customer.type", "label": "Customer type",
      "props": { "options": [ { "label": "Individual", "value": "individual" }, { "label": "Company", "value": "company" } ] },
      "validator": { "type": "string", "required": true, "messages": { "invalid": "Choose a customer type", "required": "Choose a customer type" } } },
    { "kind": "display", "type": "alert", "include": { "in": ["isCompany"] },
      "props": { "level": "info", "text": "Company accounts are reviewed manually." } },
    { "kind": "input", "type": "textinput", "path": "customer.company", "label": "Company name",
      "include": { "in": ["isCompany"] },
      "validator": { "type": "string", "required": true, "messages": { "invalid": "Company name is required", "required": "Company name is required" } } },
    { "kind": "action", "type": "button", "actionType": "submit", "label": "Continue" }
  ]
}`,
  parameters: {
    type: 'object',
    properties: {
      formDef: {
        type: 'object',
        description:
          'GolemUI form definition: { "form": [ ...widgets ], "states"?: { name: expression } }',
      },
      data: {
        type: 'object',
        description:
          'Initial form data pre-filled from the conversation, keyed by widget paths.',
      },
    },
    required: ['formDef'],
  },
};
