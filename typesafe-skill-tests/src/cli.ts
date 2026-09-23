/**
 * skilltest — unit tests for agent skills, graded by TypeSafe.
 *
 *   tsx src/cli.ts --skill <skill dir> [options] <spec.yaml | dir>...
 *
 * Options:
 *   --dry-run            Build every request (baseline + mutations) but call nothing.
 *                        Verifies that sections and mutation needles match the skill.
 *   --no-mutations       Skip mutation runs.
 *   --json               Print a JSON report instead of text (for CI).
 *   --min-confidence N   Choice confidence bar (default 0.5).
 *   --noul-yes N         P(yes) needed for an expected "yes" (default 0.7).
 *   --noul-no N          P(yes) allowed for an expected "no" (default 0.3).
 *   --kill-drop N        A mutation "kills" a test when the test fails on the mutated skill OR
 *                        the probability of the expected answer drops by at least N from the
 *                        baseline (default 0.3). The drop rule keeps borderline mutations
 *                        from flipping between runs.
 *
 * Exit code 1 when a test fails or a mutation survives.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { DEFAULT_THRESHOLDS, buildRequest, grade, type Thresholds, type Verdict } from './grade.js';
import { applyMutation, readSkillText } from './skill-text.js';
import { loadSpec, type SpecFile } from './spec.js';

interface MutationReport {
  id: string;
  note?: string;
  /**
   * Tests the mutation had to break, with whether each one did. A test that already fails on
   * the unmodified skill cannot show anything about the mutation (`baselineFailed`).
   */
  expected: { id: string; broke: boolean; baselineFailed: boolean; drop: number }[];
  /** Tests it was not supposed to touch but broke anyway (informational). */
  collateral: string[];
  killed: boolean;
}

interface FileReport {
  spec: string;
  file: string;
  sections: string[];
  chars: number;
  verdicts: Verdict[];
  mutations: MutationReport[];
  usage: { input_tokens: number; output_tokens: number };
  model?: string;
  error?: string;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadDotEnv(resolve('.env'));

  const skillDir = resolve(args.skill);
  if (!existsSync(join(skillDir, 'SKILL.md'))) {
    fail(`no SKILL.md in ${skillDir} (pass --skill <dir>)`);
  }
  const specPaths = collectSpecs(args.paths);
  if (specPaths.length === 0) fail('no .yaml spec files found');

  const client = args.dryRun ? undefined : new TypeSafeClient({ timeout: 60_000 });
  if (!args.dryRun && !process.env.TYPESAFE_API_KEY) {
    fail('TYPESAFE_API_KEY is not set. Copy .env.example to .env and add your key, or use --dry-run.');
  }

  const reports: FileReport[] = [];
  for (const specPath of specPaths) {
    reports.push(await runSpec(specPath, skillDir, client, args));
  }

  const ok = reports.every((r) => !r.error && r.verdicts.every((v) => v.pass) && r.mutations.every((m) => m.killed));
  if (args.json) {
    console.log(JSON.stringify({ ok, skill: skillDir, dryRun: args.dryRun, reports }, null, 2));
  } else {
    printText(reports, args);
  }
  process.exit(ok ? 0 : 1);
}

async function runSpec(
  specPath: string,
  skillDir: string,
  client: TypeSafeClient | undefined,
  args: Args,
): Promise<FileReport> {
  let spec: SpecFile;
  const base: FileReport = {
    spec: specPath,
    file: 'SKILL.md',
    sections: [],
    chars: 0,
    verdicts: [],
    mutations: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
  try {
    spec = loadSpec(specPath);
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
  base.file = spec.file;
  base.sections = spec.sections;

  let text: string;
  try {
    text = readSkillText(skillDir, spec.file, spec.sections);
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
  base.chars = text.length;

  // Every mutation must at least apply cleanly, dry-run or not.
  const mutated: { id: string; text: string }[] = [];
  for (const m of spec.mutations) {
    try {
      mutated.push({ id: m.id, text: applyMutation(text, m) });
    } catch (e) {
      return { ...base, error: (e as Error).message };
    }
  }

  if (!client) {
    // Dry run: show that the requests build, and how big they are.
    buildRequest(text, spec.tests);
    return {
      ...base,
      verdicts: spec.tests.map((t) => ({
        id: t.id,
        expect: t.expect,
        answer: '(dry run)',
        confidence: 0,
        expectedProb: 0,
        pass: true,
        weak: false,
      })),
      mutations: spec.mutations.map((m) => ({
        id: m.id,
        note: m.note,
        expected: m.kills.map((id) => ({ id, broke: true, baselineFailed: false, drop: NaN })),
        collateral: [],
        killed: true,
      })),
    };
  }

  try {
    const baseline = await grade(client, text, spec.tests, args.thresholds);
    base.verdicts = baseline.verdicts;
    base.model = baseline.model;
    base.usage = { ...baseline.usage };

    if (!args.mutations) return base;

    const passedBefore = new Set(baseline.verdicts.filter((v) => v.pass).map((v) => v.id));
    for (const m of spec.mutations) {
      const mutText = mutated.find((x) => x.id === m.id)!.text;
      const run = await grade(client, mutText, spec.tests, args.thresholds);
      base.usage.input_tokens += run.usage.input_tokens;
      base.usage.output_tokens += run.usage.output_tokens;
      const failedNow = new Set(run.verdicts.filter((v) => !v.pass).map((v) => v.id));
      const expected = m.kills.map((id) => {
        const before = baseline.verdicts.find((v) => v.id === id)!;
        const after = run.verdicts.find((v) => v.id === id)!;
        const drop = before.expectedProb - after.expectedProb;
        // "Broke" = the test noticed: it fails now, or its expected answer lost a lot of mass.
        return { id, broke: !after.pass || drop >= args.killDrop, baselineFailed: !before.pass, drop };
      });
      const collateral = [...failedNow].filter((id) => !m.kills.includes(id) && passedBefore.has(id));
      // Killed only on evidence: every expected test passed before and fails now.
      const killed = expected.every((e) => e.broke && !e.baselineFailed);
      base.mutations.push({ id: m.id, note: m.note, expected, collateral, killed });
    }
    return base;
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- reporting

function printText(reports: FileReport[], args: Args) {
  let tests = 0;
  let passed = 0;
  let mutations = 0;
  let killed = 0;
  let input = 0;
  let output = 0;

  for (const r of reports) {
    const where = r.sections.length ? `${r.file} › ${r.sections.join(' + ')}` : r.file;
    console.log(`\n${r.spec}\n  ${where}  (${r.chars} chars)${r.model ? `  model ${r.model}` : ''}`);
    if (r.error) {
      console.log(`  ✗ ERROR: ${r.error}`);
      continue;
    }
    for (const v of r.verdicts) {
      tests++;
      if (v.pass) passed++;
      const mark = v.pass ? '✓' : v.weak ? '~' : '✗';
      const conf = args.dryRun ? '' : `  ${fmtConfidence(v)}`;
      const got = v.pass || args.dryRun ? v.answer : `${v.answer}  (expected ${v.expect})`;
      const variants = v.variants && !args.dryRun ? `  variants [${v.variants.map((p) => p.toFixed(2)).join(' ')}]` : '';
      console.log(`  ${mark} ${v.id.padEnd(28)} ${got}${conf}${variants}`);
    }
    if (r.mutations.length) {
      console.log('  mutations:');
      for (const m of r.mutations) {
        mutations++;
        if (m.killed) killed++;
        const untestable = !args.dryRun && m.expected.some((e) => e.baselineFailed);
        const status = args.dryRun ? 'applies' : m.killed ? 'killed' : untestable ? 'UNTESTABLE' : 'SURVIVED';
        const detail = args.dryRun
          ? ''
          : '  ' +
            m.expected
              .map((e) => `${e.baselineFailed ? '?' : e.broke ? '✓' : '✗'}${e.id}${fmtDrop(e.drop)}`)
              .join(' ') +
            (m.collateral.length ? `  (also broke: ${m.collateral.join(', ')})` : '') +
            (untestable ? '  (? = already failing on the unmodified skill)' : '');
        console.log(`  ${m.killed ? '✓' : '✗'} ${m.id.padEnd(28)} ${status}${detail}`);
      }
    }
    input += r.usage.input_tokens;
    output += r.usage.output_tokens;
  }

  console.log('');
  if (args.dryRun) {
    console.log(`dry run: ${tests} tests, ${mutations} mutations, all requests build.`);
  } else {
    console.log(`${passed}/${tests} tests passed · ${killed}/${mutations} mutations killed · ${input} in / ${output} out tokens`);
  }
  console.log('');
}

/** How much probability the expected answer lost under the mutation, e.g. "(−0.72)". */
function fmtDrop(drop: number): string {
  if (!Number.isFinite(drop)) return '';
  return `(${drop >= 0 ? '−' : '+'}${Math.abs(drop).toFixed(2)})`;
}

function fmtConfidence(v: Verdict): string {
  if (v.probabilities) {
    const top = Object.entries(v.probabilities)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, p]) => `${k} ${(p * 100).toFixed(0)}%`)
      .join(', ');
    return `conf ${v.confidence.toFixed(2)}  [${top}]`;
  }
  return `P(yes) ${v.confidence.toFixed(2)}`;
}

// ---------------------------------------------------------------- plumbing

interface Args {
  skill: string;
  paths: string[];
  dryRun: boolean;
  mutations: boolean;
  json: boolean;
  thresholds: Thresholds;
  killDrop: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    skill: '.',
    paths: [],
    dryRun: false,
    mutations: true,
    json: false,
    thresholds: { ...DEFAULT_THRESHOLDS },
    killDrop: 0.3,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      return v;
    };
    if (a === '--skill') args.skill = next();
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-mutations') args.mutations = false;
    else if (a === '--json') args.json = true;
    else if (a === '--min-confidence') args.thresholds.minConfidence = Number(next());
    else if (a === '--noul-yes') args.thresholds.noulYes = Number(next());
    else if (a === '--noul-no') args.thresholds.noulNo = Number(next());
    else if (a === '--kill-drop') args.killDrop = Number(next());
    else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else args.paths.push(a);
  }
  if (args.paths.length === 0) args.paths.push('tests');
  return args;
}

function collectSpecs(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const full = resolve(p);
    if (!existsSync(full)) fail(`not found: ${p}`);
    if (statSync(full).isDirectory()) {
      for (const f of readdirSync(full).sort()) {
        if (/\.ya?ml$/.test(f)) out.push(join(full, f));
      }
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Minimal .env reader so the runner needs no extra dependency. */
function loadDotEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = value;
  }
}

function fail(msg: string): never {
  console.error(`skilltest: ${msg}`);
  process.exit(2);
}

main();
