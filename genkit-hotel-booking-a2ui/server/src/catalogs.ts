import type { A2uiCatalog, A2uiCatalogComponent } from '@genkit-ai/a2ui';
import { basicCatalogComponents } from './basic-catalog';
import { BASIC_CATALOG_ID } from '@hotel/shared';

/**
 * The catalog, as the AGENT sees it (the `a2ui()` middleware injects these
 * descriptions into the system prompt). The Angular app registers the
 * renderer's BasicCatalog under the same id.
 */

/** Renderer quirks the schema can't tell the model. */
const RENDERER_NOTES: A2uiCatalogComponent = {
  name: 'Renderer notes (Angular)',
  description: 'Not a component: how the Angular renderer behaves.',
  props:
    'ChoicePicker value is ALWAYS a string[] (even for one choice) and its `label` is NOT displayed — put a caption Text before it. Check messages only show on TextField and Slider. TextField values are strings.',
};

const CHECKS_NOTE: A2uiCatalogComponent = {
  name: 'checks (any input or Button)',
  description:
    'Not a component: an optional `checks` array on any input or Button for validation. A Button with a failing check is disabled.',
  props:
    'checks: [{ condition: <boolean expression>, message: string }]. Expressions: { "call": "required", "args": { "value": { "path": "/x" } } }, { "call": "numeric", "args": { "value": {path}, "min": n, "max": n } } (numbers only — TextField values are strings, use regex for those), { "call": "length", "args": { "value": {path}, "min": n, "max": n } }, { "call": "regex", "args": { "value": {path}, "pattern": "..." } }, combined with { "call": "and"|"or", "args": { "values": [ ... ] } } and { "call": "not", "args": { "value": ... } }. There is NO arithmetic or comparison between fields. Text can be formatted with { "call": "formatCurrency", "args": { "value": {path}, "currency": "EUR" }, "returnType": "string" } and { "call": "formatString", "args": { "value": "Hi ${/name}" }, "returnType": "string" }.',
};

/** The v0.9 basic catalog, described from the renderer's own schema (see basic-catalog.ts), plus notes. */
export const basicCatalog: A2uiCatalog = {
  id: BASIC_CATALOG_ID,
  components: [...basicCatalogComponents(), CHECKS_NOTE, RENDERER_NOTES],
};
