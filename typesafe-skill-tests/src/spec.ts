/**
 * The test file format (YAML) and its validation.
 *
 * One file = one part of the skill (a heading of SKILL.md or a reference file) plus
 * the decisions an agent reading that part must be able to make. Tests are data:
 * no code, no assertions beyond `expect`, so they can be generated later from a
 * typed skill source and diffed like any other fixture.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/** A closed decision: either a pick among labelled options, or yes/no. */
export interface TestCase {
  id: string;
  /**
   * The situation the agent is in, in one or several phrasings. Each phrasing is asked
   * separately; the test's verdict is the median variant's, so it measures whether the
   * rule holds across the ways real users say the same thing.
   */
  scenarios: string[];
  /** What we ask about that situation. */
  question: string;
  /** Labelled options → a TypeSafe Choice. Omitted → yes/no (Noul). */
  options?: Record<string, string | null>;
  /** One of the option labels, or "yes" / "no" for a yes/no test. */
  expect: string;
}

/** A deliberate edit of the skill text that must make specific tests fail. */
export interface Mutation {
  id: string;
  /** Why this edit matters: what a careless rewrite of the skill could do. */
  note?: string;
  remove?: string[];
  replace?: { find: string; with: string }[];
  append?: string;
  /** Tests that must FAIL once the edit is applied. If any still passes, the mutation survived. */
  kills: string[];
}

export interface SpecFile {
  /** Path to the spec file itself (for reports). */
  path: string;
  /** File inside the skill folder to read. Default: SKILL.md. */
  file: string;
  /** Heading(s) to slice out of `file`. Omitted → the whole file. */
  sections: string[];
  tests: TestCase[];
  mutations: Mutation[];
}

export function loadSpec(path: string): SpecFile {
  const raw = parse(readFileSync(path, 'utf8'));
  const where = (msg: string) => new Error(`${path}: ${msg}`);
  if (!raw || typeof raw !== 'object') throw where('top level must be a mapping');

  const file = raw.file ?? 'SKILL.md';
  if (typeof file !== 'string') throw where('`file` must be a string');

  const sections = raw.section === undefined ? [] : Array.isArray(raw.section) ? raw.section : [raw.section];
  for (const s of sections) if (typeof s !== 'string') throw where('`section` must be a string or a list of strings');

  if (!Array.isArray(raw.tests) || raw.tests.length === 0) throw where('`tests` must be a non-empty list');
  const ids = new Set<string>();
  const tests: TestCase[] = raw.tests.map((t: unknown, i: number) => {
    const at = (msg: string) => where(`tests[${i}]: ${msg}`);
    if (!t || typeof t !== 'object') throw at('must be a mapping');
    const test = t as Record<string, unknown>;
    for (const key of ['id', 'question', 'expect'] as const) {
      if (typeof test[key] !== 'string' || !(test[key] as string).trim()) throw at(`\`${key}\` is required`);
    }
    const scenarios = Array.isArray(test.scenario) ? test.scenario : [test.scenario];
    if (scenarios.length === 0 || scenarios.some((v) => typeof v !== 'string' || !v.trim())) {
      throw at('`scenario` must be a non-empty string or a list of them');
    }
    const id = test.id as string;
    if (ids.has(id)) throw at(`duplicate id "${id}"`);
    ids.add(id);

    let options: Record<string, string | null> | undefined;
    if (test.options !== undefined) {
      options = normaliseOptions(test.options, at);
      if (Object.keys(options).length < 2) throw at('`options` needs at least two entries');
      if (!(String(test.expect) in options)) throw at(`\`expect\` "${test.expect}" is not one of the options`);
    } else {
      const e = String(test.expect).toLowerCase();
      if (e !== 'yes' && e !== 'no') throw at('without `options`, `expect` must be "yes" or "no"');
    }
    return {
      id,
      scenarios: scenarios as string[],
      question: test.question as string,
      options,
      expect: options ? String(test.expect) : String(test.expect).toLowerCase(),
    };
  });

  const mutations: Mutation[] = (raw.mutations ?? []).map((m: unknown, i: number) => {
    const at = (msg: string) => where(`mutations[${i}]: ${msg}`);
    if (!m || typeof m !== 'object') throw at('must be a mapping');
    const mut = m as Record<string, unknown>;
    if (typeof mut.id !== 'string') throw at('`id` is required');
    const remove = mut.remove === undefined ? [] : Array.isArray(mut.remove) ? mut.remove : [mut.remove];
    for (const r of remove) if (typeof r !== 'string') throw at('`remove` must be a string or list of strings');
    const replace = (mut.replace ?? []) as unknown[];
    if (!Array.isArray(replace)) throw at('`replace` must be a list of { find, with }');
    for (const r of replace) {
      const rr = r as Record<string, unknown>;
      if (!rr || typeof rr.find !== 'string' || typeof rr.with !== 'string') throw at('each `replace` needs `find` and `with`');
    }
    if (mut.append !== undefined && typeof mut.append !== 'string') throw at('`append` must be a string');
    if (remove.length + replace.length + (mut.append ? 1 : 0) === 0) throw at('needs at least one of remove / replace / append');
    if (!Array.isArray(mut.kills) || mut.kills.length === 0) throw at('`kills` must list the tests this edit must break');
    for (const k of mut.kills) if (!ids.has(String(k))) throw at(`\`kills\` references unknown test "${k}"`);
    return {
      id: mut.id,
      note: typeof mut.note === 'string' ? mut.note : undefined,
      remove: remove as string[],
      replace: replace as { find: string; with: string }[],
      append: mut.append as string | undefined,
      kills: mut.kills.map(String),
    };
  });

  return { path, file, sections, tests, mutations };
}

/** `options` may be a mapping label → description, or a plain list of labels. */
function normaliseOptions(
  value: unknown,
  at: (msg: string) => Error,
): Record<string, string | null> {
  if (Array.isArray(value)) {
    const out: Record<string, string | null> = {};
    for (const v of value) {
      if (typeof v !== 'string') throw at('`options` list entries must be strings');
      out[v] = null;
    }
    return out;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== null && typeof v !== 'string') throw at(`option "${k}" description must be a string or null`);
      out[k] = v;
    }
    return out;
  }
  throw at('`options` must be a mapping or a list');
}
