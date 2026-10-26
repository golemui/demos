import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { A2UIInlineCatalogSchema } from '@ag-ui/a2ui-middleware';

/**
 * The A2UI v0.9 basic catalog as the PURE agent sees it: the inline catalog
 * schema @ag-ui/a2ui-middleware injects into every run (component name → JSON
 * Schema), built from the RENDERER's own JSON Schema (`@a2ui/web_core`'s
 * catalog.json) so what the model is told and what the browser validates
 * can't drift.
 *
 * Each component's `allOf` (common props + its own) is flattened into one
 * object schema: the middleware's validator reads the top-level `required`,
 * and a flat schema is what a model reads best. `$ref`s point at the `$defs`
 * shipped alongside (DynamicString, Action, CheckRule…), and `functions`
 * lists the client functions `checks` can call.
 */

type Schema = {
  $ref?: string;
  type?: string;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  allOf?: Schema[];
  [key: string]: unknown;
};

interface CatalogDocument {
  catalogId: string;
  components: Record<string, Schema>;
  functions: Record<string, Schema>;
  $defs: Record<string, Schema>;
}

export const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';

function webCoreSchemas(): { catalog: CatalogDocument; common: { $defs: Record<string, Schema> } } {
  // web_core exports no JSON subpaths: locate the package from its main entry.
  const require = createRequire(import.meta.url);
  let dir = dirname(require.resolve('@a2ui/web_core'));
  while (!readFileSafe(join(dir, 'package.json')).includes('"name": "@a2ui/web_core"')) dir = dirname(dir);
  const read = (path: string) => JSON.parse(readFileSync(join(dir, 'src/v0_9/schemas', path), 'utf8'));
  return { catalog: read('catalogs/basic/catalog.json'), common: read('common_types.json') };
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/** `https://…/common_types.json#/$defs/X` and `#/$defs/X` both become `#/$defs/X`. */
function localRefs<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replace(/"\$ref":"[^"#]*#\/\$defs\//g, '"$ref":"#/$defs/')) as T;
}

function flatten(schema: Schema, defs: Record<string, Schema>): Schema {
  const parts = (schema.allOf ?? [schema]).map((part) => (part.$ref ? defs[part.$ref.split('/').pop()!] : part));
  const properties: Record<string, Schema> = {};
  const required = new Set<string>();
  for (const part of parts) {
    Object.assign(properties, part.properties);
    part.required?.forEach((name) => required.add(name));
  }
  return { type: 'object', properties, required: [...required], additionalProperties: false };
}

export function basicCatalogSchema(): A2UIInlineCatalogSchema {
  const { catalog, common } = webCoreSchemas();
  const defs = localRefs({ ...common.$defs, ...catalog.$defs });
  const components = Object.fromEntries(
    Object.entries(localRefs(catalog.components)).map(([name, schema]) => [name, flatten(schema, defs)]),
  );
  const { anyComponent: _a, anyFunction: _f, CatalogComponentCommon: _c, theme: _t, ...shared } = defs;
  return { catalogId: catalog.catalogId, components, functions: localRefs(catalog.functions), $defs: shared } as A2UIInlineCatalogSchema;
}
