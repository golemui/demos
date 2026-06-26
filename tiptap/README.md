# Turn a Tiptap document into a database

A Tiptap document already serializes to JSON. This demo adds a custom
`golemForm` node whose attributes hold a GolemUI **form definition** (the same
`{ "$schema": "…", "form": [ … ] }` JSON that renders in React, Angular, Vue,
Lit and vanilla) plus the **values captured from it**. The result is a single
tree you can store, diff, and transfer.

## What it shows off

- **Forms as first-class blocks** — `golemForm` is a ProseMirror `atom` node with
  a React node view that mounts a real `<GuiForm>`. It drags, selects and deletes
  like any other block.
- **A form is just JSON** — each block's `formDef` attribute is a plain GolemUI
  form definition. No builder, no codegen: `config.formDef = node.attrs.formDef`.
- **The document is the data** — fill a form and the values are mirrored into the
  node's `value` attribute. The **`editor.getJSON()`** panel on the right updates
  live, showing prose nodes and `golemForm` nodes (definition **and** captured
  values) in one tree.
- **Validation runs inside the editor** — required fields, enums and formats all
  validate in-place (`validateOn: 'eager'`).
- **Zero event leakage** — typing in a form field never mutates the document or
  moves the editor selection (see _Event isolation_ below).
- **Round-trips** — _Save & reload from JSON_ serializes the doc, tears it down,
  and rebuilds it purely from `getJSON()`; forms and every captured value return
  exactly.
- **Slash command** — `/` opens a menu of starter forms (Contact, RSVP,
  Feedback), each a ready GolemUI definition.

## Run it

```bash
npm install
npm run dev
```

`npm run build` runs the typecheck (`tsc -b`) + the production bundle.

### Try this

1. Click into the embedded **Contact** form and type — the JSON panel on the
   right updates on every keystroke. The editor selection never moves.
2. Type `/` on a new line and pick **RSVP** or **Feedback** to insert another
   form.
3. Submit a form — the block shows a _submitted_ badge and its `value` is written
   into the document.
4. Hit **Save & reload from JSON** — the document is rebuilt from `getJSON()`
   alone; your answers come back intact.

## How it works

1. **The node** (`src/editor/golem-form-node.ts`): `Node.create({ name:
   'golemForm', group: 'block', atom: true, draggable: true })` with three
   attributes — `formDef` (the GolemUI definition), `value` (captured data) and
   `formId` (a nanoid). `parseHTML`/`renderHTML` store `data-golem-form` /
   `data-golem-value` so HTML copy-paste round-trips too.
2. **The node view** (`src/editor/GolemFormNodeView.tsx`): a `NodeViewWrapper`
   that renders `<GuiForm config={{ formDef, data, validateOn: 'eager' }} />`.
   Persisted values seed the form **once** at mount (`useRef`), so the live form
   owns its own state and the caret is never stolen. Values flow back out via
   wired change events and are stored on the node for serialization.
3. **Live values** (`src/editor/wireChangeEvents.ts`): GolemUI emits `formEvent`
   on submit only, so the rendered clone has `on.change` wired onto every input.
   The pristine definition stays on `node.attrs.formDef` for the JSON panel.
4. **Slash command** (`src/editor/slash-command.ts` + `SlashMenu.tsx`): built on
   `@tiptap/suggestion` + Tiptap's `ReactRenderer`. Picking a template runs
   `insertGolemForm(formDef)`.
5. **JSON panel** (`src/view-json-panel.tsx`): subscribes to the editor's
   `update` / `selectionUpdate` events and re-renders `editor.getJSON()`.

## Learn more

- [GolemUI docs](https://golemui.com/dx/getting-started/installation/)
- [Form definition API](https://golemui.com/dx/form-definition-api/)
- [Widgets reference](https://golemui.com/dx/widgets-reference/)
- [Tiptap node views (React)](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react)
