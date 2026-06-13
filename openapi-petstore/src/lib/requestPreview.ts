import { PETSTORE_BASE, type EndpointDef } from '../endpoints';

/** The pieces of an HTTP request, ready to render in the preview panel. */
export interface BuiltRequest {
  method: string;
  /** The request line, e.g. `POST https://petstore3.swagger.io/api/v3/pet`. */
  url: string;
  /** Pretty-printed JSON body (body-style endpoints) or `null`. */
  body: string | null;
  /** A copy-pasteable curl command. */
  curl: string;
}

/** Just the meta the request builder needs — a structural subset of EndpointDef. */
type RequestMeta = Pick<EndpointDef, 'method' | 'path' | 'paramStyle'>;

/**
 * Drop empty leaves (null/undefined, '', empty arrays/objects) the way an API
 * client would, while keeping meaningful falsy values like `0` and `false`.
 */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((v) => v !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const pruned = prune(v);
      if (pruned !== undefined) out[k] = pruned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (value === null || value === undefined || value === '') return undefined;
  return value;
}

/** Flatten top-level form data into `key=value` query pairs (arrays repeat the key). */
function toQuery(data: Record<string, unknown>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined || value === '') continue;
    const push = (v: unknown) =>
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    if (Array.isArray(value)) value.forEach(push);
    else push(value);
  }
  return pairs.join('&');
}

/**
 * Turn the live form data into the request GolemUI would send for this
 * operation. Body-style operations get a JSON body; query-style operations
 * (no request body in the spec) get a URL query string.
 */
export function buildRequest(form: unknown, meta: RequestMeta): BuiltRequest {
  const data = (prune(form) as Record<string, unknown>) ?? {};

  if (meta.paramStyle === 'query') {
    const query = toQuery(data);
    const url = `${PETSTORE_BASE}${meta.path}${query ? `?${query}` : ''}`;
    return {
      method: meta.method,
      url: `${meta.method} ${url}`,
      body: null,
      curl: `curl '${url}'`,
    };
  }

  const body = JSON.stringify(data, null, 2);
  const url = `${PETSTORE_BASE}${meta.path}`;
  const curl =
    `curl -X ${meta.method} '${url}' \\\n` +
    `  -H 'Content-Type: application/json' \\\n` +
    `  -d '${JSON.stringify(data)}'`;
  return {
    method: meta.method,
    url: `${meta.method} ${url}`,
    body,
    curl,
  };
}
