#!/usr/bin/env node
/*
 * Copies the single source of truth in /shared into each demo's src/_shared/.
 *
 * Why copy instead of import from a shared folder or a package? Each demo is
 * opened *independently* in StackBlitz, which serves only that subfolder and
 * installs deps from npm — it can never reach a sibling /shared folder. So the
 * shared chrome must physically live inside every demo's src/. This is an
 * authoring-time step; nothing runs it at demo runtime.
 *
 * Run it with `npm run sync` from the repo root. The .githooks/pre-commit hook
 * runs it automatically and stages the result; CI fails if it's out of date.
 */
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'shared');
const DEMOS = ['credit-card', 'leaflet', 'temperature-chart', 'openapi-petstore'];
const DEST_SUBDIR = join('src', '_shared');

const banner = (file) =>
  `/* AUTO-GENERATED from shared/${file} — edit there and run \`npm run sync\`. Do not edit here. */\n`;

const files = readdirSync(SOURCE).filter((f) =>
  statSync(join(SOURCE, f)).isFile(),
);

if (files.length === 0) {
  console.error('sync-shared: no files found in /shared');
  process.exit(1);
}

for (const demo of DEMOS) {
  const dest = join(ROOT, demo, DEST_SUBDIR);
  // Start clean so renamed/removed files don't linger (files are read-only,
  // but the directory is writable so removal succeeds).
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  for (const file of files) {
    const content = readFileSync(join(SOURCE, file), 'utf8');
    const target = join(dest, file);
    writeFileSync(target, banner(file) + content);
    // Read-only on disk to discourage editing the generated copy. (git tracks
    // only the executable bit, so this produces no spurious mode diffs.)
    chmodSync(target, 0o444);
  }
}

console.log(
  `sync-shared: copied ${files.length} file(s) into ${DEMOS.length} demos → ${DEMOS
    .map((d) => `${d}/${DEST_SUBDIR}`)
    .join(', ')}`,
);
