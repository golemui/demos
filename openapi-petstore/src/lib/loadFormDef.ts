/** The shape of a form-definition JSON file under `public/forms/`. */
export interface FormDefinitionFile {
  $schema?: string;
  states?: Record<string, string>;
  form: unknown[];
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch a GolemUI form definition over HTTP. The files are served locally so
 * they'd resolve instantly — a small simulated latency keeps the loading state
 * visible (and mirrors fetching a definition from a real service).
 */
export async function loadFormDef(
  url: string,
  signal?: AbortSignal,
): Promise<FormDefinitionFile> {
  await delay(500);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Could not load ${url} — HTTP ${res.status}`);
  }
  const def = (await res.json()) as FormDefinitionFile;
  if (!def || !Array.isArray(def.form)) {
    throw new Error('Invalid form definition: missing a top-level `form` array.');
  }
  return def;
}
