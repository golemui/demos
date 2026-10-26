import { operationFields, type AskableOperation } from '@hotel/shared';
import { formatValue } from './format';

/** Dotted-path helpers: request fields are addressed like "specialRequests.parking". */
export function getPath(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], data);
}

export function pickPaths(data: Record<string, unknown>, paths: string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const path of paths) {
    const value = getPath(data, path);
    if (value === undefined) continue;
    const keys = path.split('.');
    let target = picked;
    for (const key of keys.slice(0, -1)) target = (target[key] ??= {}) as Record<string, unknown>;
    target[keys[keys.length - 1]] = value;
  }
  return picked;
}

/** Human labels for a field and its value, straight from the contract (titles + oneOf). */
export function fieldLabel(operation: AskableOperation, path: string): string {
  return lookup(operation)[path]?.label ?? path;
}

export function valueLabel(operation: AskableOperation, path: string, value: unknown): string {
  return lookup(operation)[path]?.options?.[String(value)] ?? formatValue(value);
}

/** "Baby crib in the room · Reserve a parking space · License plate: 1234 ABC" */
export function describeSpecialRequests(requests: object | undefined): string[] {
  return Object.entries(requests ?? {})
    .filter(([, value]) => value !== false && value !== '' && value !== undefined && value !== null)
    .map(([key, value]) => {
      const path = `specialRequests.${key}`;
      return value === true ? fieldLabel('createBooking', path) : `${fieldLabel('createBooking', path)}: ${valueLabel('createBooking', path, value)}`;
    });
}

const cache = new Map<AskableOperation, Record<string, { label: string; options?: Record<string, string> }>>();

function lookup(operation: AskableOperation) {
  if (!cache.has(operation)) {
    cache.set(
      operation,
      Object.fromEntries(
        operationFields(operation).map(({ name, field }) => [
          name,
          {
            label: field.title ?? name,
            options: field.oneOf && Object.fromEntries(field.oneOf.map((option) => [option.const, option.title ?? option.const])),
          },
        ]),
      ),
    );
  }
  return cache.get(operation)!;
}
