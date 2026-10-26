/* AUTO-GENERATED from shared/hotel/shared/src/contract.ts — edit there and run `npm run sync`. Do not edit here. */
import { hotelApi, type AskableOperation } from './hotel-api';

/**
 * The hotel contract, read the way the agent and the mock API need it: the
 * request schema of an operation (`$ref` resolved), its fields, and a one-line
 * description of each field for the agent's tool descriptions.
 */

export type SchemaNode = {
  type?: string;
  title?: string;
  description?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  required?: readonly string[];
  properties?: Record<string, SchemaNode>;
  oneOf?: ReadonlyArray<{ const: string; title?: string }>;
  $ref?: string;
};

/**
 * An object field is either ONE value (dates: { start, end }, all required —
 * asked as a unit) or an optional GROUP of independent fields (specialRequests —
 * asked field by field, as "specialRequests.parking").
 */
export function isGroup(field: SchemaNode): boolean {
  return field.type === 'object' && !!field.properties && (field.required ?? []).length === 0;
}

type Operation = AskableOperation | 'checkAvailability' | 'createPayment';

/** The JSON Schema of an operation's request body, with the $ref resolved. */
export function requestSchema(operation: Operation): SchemaNode {
  for (const op of operations()) {
    if (op.operationId !== operation) continue;
    const ref = op.requestBody.content['application/json'].schema.$ref ?? '';
    const name = ref.split('/').pop() as keyof typeof hotelApi.components.schemas;
    return hotelApi.components.schemas[name] as unknown as SchemaNode;
  }
  throw new Error(`Unknown operation "${operation}"`);
}

export function operationSummary(operation: Operation): string {
  return operations().find((op) => op.operationId === operation)?.summary ?? operation;
}

type OperationObject = {
  operationId: string;
  summary: string;
  requestBody: { content: Record<string, { schema: SchemaNode }> };
};

/** Every operation of the contract, whatever its HTTP method. */
function operations(): OperationObject[] {
  return Object.values(hotelApi.paths).flatMap((pathItem) => Object.values(pathItem) as OperationObject[]);
}

/** Every askable field of an operation: top-level fields, and groups expanded to "group.field". */
export function operationFields(
  operation: AskableOperation,
): Array<{ name: string; field: SchemaNode; required: boolean }> {
  const schema = requestSchema(operation);
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).flatMap(([name, field]) =>
    isGroup(field)
      ? Object.entries(field.properties ?? {}).map(([sub, subField]) => ({
          name: `${name}.${sub}`,
          field: subField,
          required: false,
        }))
      : [{ name, field, required: required.has(name) }],
  );
}

/** One line per field, for a tool description the agent reads. */
export function describeOperation(operation: AskableOperation): string {
  return operationFields(operation)
    .map(({ name, field, required }) => `  - ${name}: ${describeField(field)}${required ? ' (required)' : ''}`)
    .join('\n');
}

function describeField(field: SchemaNode): string {
  const parts = [field.title ?? ''];
  if (field.oneOf) parts.push(`one of ${field.oneOf.map((o) => `"${o.const}"`).join(' | ')}`);
  else if (field.type === 'object' && field.properties) {
    parts.push(
      `{ ${Object.keys(field.properties)
        .map(
          (key) => `"${key}": ${field.properties![key].format === 'date' ? 'YYYY-MM-DD' : field.properties![key].type}`,
        )
        .join(', ')} }`,
    );
  } else if (field.type) {
    const range = field.minimum !== undefined ? ` ${field.minimum}–${field.maximum}` : '';
    parts.push(`${field.type}${range}`);
  }
  const line = parts.filter(Boolean).join(', ');
  return field.description ? `${line} — ${field.description}` : line;
}
