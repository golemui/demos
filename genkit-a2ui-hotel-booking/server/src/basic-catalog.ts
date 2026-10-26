import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { basicCatalog as pluginBasicCatalog, type A2uiCatalogComponent } from '@genkit-ai/a2ui';

/**
 * The model-facing description of the A2UI v0.9 basic catalog, generated from
 * the RENDERER's own JSON Schema (`@a2ui/web_core`'s catalog.json) instead of
 * @genkit-ai/a2ui's hand-written text.
 *
 * Why: the plugin's text had drifted from what the renderer accepts — it
 * advertises `Slider.step` and `List.listStyle`, which web_core's strict
 * schemas reject ("Unrecognized key(s) in object: 'step'"), and it omits
 * DateTimeInput, ChoicePicker and `checks`. Generating the props from the
 * schema keeps what the agent is told and what the renderer validates in sync.
 */

type Schema = {
  $ref?: string;
  type?: string;
  enum?: string[];
  const?: string;
  description?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
};

const COMMON_PROPS = new Set(['id', 'component', 'accessibility']);

function webCoreCatalog(): { components: Record<string, Schema> } {
  // web_core exports no JSON subpaths: locate the package from its main entry.
  const require = createRequire(import.meta.url);
  let dir = dirname(require.resolve('@a2ui/web_core'));
  while (!readFileSafe(join(dir, 'package.json')).includes('"name": "@a2ui/web_core"')) dir = dirname(dir);
  return JSON.parse(readFileSync(join(dir, 'src/v0_9/schemas/catalogs/basic/catalog.json'), 'utf8'));
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function describeType(schema: Schema): string {
  const ref = schema.$ref?.split('/').pop();
  switch (ref) {
    case 'DynamicString':
      return 'string or { path } binding';
    case 'DynamicNumber':
      return 'number or { path } binding';
    case 'DynamicBoolean':
      return 'boolean or { path } binding';
    case 'DynamicStringList':
      return 'string[] or { path } binding';
    case 'ChildList':
      return 'string[] of component ids';
    case 'ComponentId':
      return 'string id of a component';
    case 'Action':
      return '{ event: { name: string, context?: object of literals or { path } } }';
  }
  if (ref) return ref;
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (alternatives) return [...new Set(alternatives.map(describeType))].join(' or ');
  if (schema.enum) return `one of ${schema.enum.join('|')}`;
  if (schema.type === 'array' && schema.items?.properties) {
    return `[{ ${Object.entries(schema.items.properties)
      .map(([key, item]) => `${key}: ${describeType(item)}`)
      .join(', ')} }]`;
  }
  if (schema.type === 'array') return `${describeType(schema.items ?? {})}[]`;
  return schema.type ?? 'any';
}

export function basicCatalogComponents(): A2uiCatalogComponent[] {
  const pluginText = new Map(pluginBasicCatalog.components.map((c) => [c.name, c.description]));
  return Object.entries(webCoreCatalog().components).map(([name, schema]) => {
    const parts = schema.allOf ?? [schema];
    const own = parts.find((part) => part.properties?.['component']) ?? {};
    const checkable = parts.some((part) => part.$ref?.endsWith('/Checkable'));
    const required = new Set(own.required ?? []);
    const props = Object.entries(own.properties ?? {})
      .filter(([prop]) => !COMMON_PROPS.has(prop))
      .map(([prop, propSchema]) => `${prop}${required.has(prop) ? '' : '?'}: ${describeType(propSchema)}`);
    props.push('weight?: number (flex-grow in a Row/Column)');
    if (checkable) props.push('checks?: [{ condition, message }]');
    return {
      name,
      description: pluginText.get(name) ?? own.description ?? schema.description ?? name,
      props: `${props.join('; ')}. No other props are accepted.`,
    };
  });
}
