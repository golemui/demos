# OpenAPI → live forms, via the GolemUI MCP

> Point the GolemUI MCP at the Petstore OpenAPI spec, pick any endpoint from a dropdown, and get a working, validated form. Edit the generated JSON and the form re-renders live; submit it and the exact payload GolemUI emits is captured below.

None of these forms were written by hand. The **GolemUI MCP server** read the
[Swagger Petstore v3](https://petstore3.swagger.io/) OpenAPI spec and emitted a
pre-validated GolemUI form definition for each operation. This playground loads
those definitions, renders them, lets you tweak the raw JSON, and shows the
request that assembles as you type plus the payload caught on submit.

**Built with GolemUI · the GolemUI MCP · Petstore OpenAPI**

## What it shows off

- **Spec-to-form via MCP** — `generate_from_openapi` turns each Petstore
  operation into a validated form definition, so the form can't drift from the
  API. `GET /pet/findByStatus` has no request body, so the MCP fell back to the
  operation's query **parameters** — a different generation path, same result.
- **Loaded over HTTP** — each definition is a real `.json` file under
  `public/forms/`, fetched at runtime with a visible loading state. The form is
  GolemUI's [JSON API](https://golemui.com/json/getting-started/installation/):
  the parsed `{ form: [...] }` handed straight to `config.formDef`.
- **A form is just JSON** — the **Form JSON** tab shows that exact file,
  editable: change it and the form re-renders live.
- **Regenerate from new input** — pick a different endpoint *or* edit the JSON
  and the engine rebuilds the form on the spot.
- **Catch the payload** — `formSubmit` hands the app the form data; it's rendered
  in the **Captured payload** panel, clearly outside the GolemUI form.

## Run it

```bash
npm install
npm run dev
```

`npm run build` runs the typecheck (`tsc -b`) + the production bundle.

## How it works

1. **Generate** — for each operation the MCP `generate_from_openapi` was called
   against `https://petstore3.swagger.io/api/v3/openapi.json`, then
   `validate_form_definition` until `valid: true` (all four returned
   `unmapped: []`). The verbatim output is saved in `public/forms/<id>.json`.
2. **Endpoints** (`src/endpoints.ts`): a metadata registry — method, path,
   summary, a trimmed spec snippet (the **OpenAPI** tab) and seed `sampleData`
   for each operation. The form definition itself lives in the JSON files.
3. **Load** (`src/lib/loadFormDef.ts`): on endpoint change the app `fetch`es the
   JSON over HTTP (with a small simulated latency so the loading state is
   visible).
4. **Render + edit** (`src/App.tsx`): the parsed `{ form: [...] }` is passed to
   `<GuiForm config={{ formDef }} />` (the JSON API). A changing `key` remounts
   the form whenever the endpoint or JSON changes.
5. **Live request** (`src/lib/wireChangeEvents.ts` + `src/lib/requestPreview.ts`
   + `src/widgets/RequestPreview.tsx`): the *rendered* clone of the form has
   `on: { change }` wired onto every input, so GolemUI emits `formEvent` with the
   full form data on every keystroke. A plain React panel turns that data into a
   live JSON body + curl. (The editable JSON panel keeps showing the pristine,
   un-wired definition.) Body-style operations get a JSON body; query-style
   operations get a `?status=…` URL.
6. **Capture** (`src/App.tsx`): `formSubmit` writes `event.data` into the
   Captured payload panel.

## Learn more

- [GolemUI docs](https://golemui.com/dx/getting-started/installation/)
- [Form definition API](https://golemui.com/dx/form-definition-api/)
- [Widgets reference](https://golemui.com/dx/widgets-reference/)
