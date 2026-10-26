#!/usr/bin/env node
/*
 * Copies the single sources of truth in /shared into the demos:
 *
 *  - /shared/*        the demo chrome (DemoShell, theme toggle, brand) → each
 *                     demo's src/_shared/
 *  - /shared/hotel/   the hotel booking core (the OpenAPI contract, pricing,
 *                     the mock hotel API…) → the same paths inside each hotel
 *                     demo. Each demo gets only the files it uses: the GolemUI
 *                     form slicer and generator go to the demos with GolemUI forms.
 *
 * Why copy instead of import from a shared folder or a package? Each demo is
 * opened *independently* in StackBlitz, which serves only that subfolder and
 * installs deps from npm — it can never reach a sibling /shared folder. So the
 * shared code must physically live inside every demo. This is an
 * authoring-time step; nothing runs it at demo runtime.
 *
 * Run it with `npm run sync` from the repo root. The .githooks/pre-commit hook
 * runs it automatically and stages the result; CI fails if it's out of date.
 * `--paths` only prints the generated paths (for the hook and CI).
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

const SHELL_SOURCE = join(ROOT, 'shared');
const SHELL_DEMOS = [
  'credit-card',
  'leaflet',
  'temperature-chart',
  'openapi-petstore',
  'tiptap',
  'agui-mastra-hotel-booking-compare/app',
  'agui-mastra-hotel-booking-a2ui/app',
  'agui-mastra-hotel-booking-golemui/app',
];
const SHELL_DEST = join('src', '_shared');

const HOTEL_SOURCE = join(ROOT, 'shared', 'hotel');
const HOTEL_CORE = [
  'shared/src/hotel-api.ts',
  'shared/src/contract.ts',
  'shared/src/pricing.ts',
  'shared/src/pricing.test.ts',
  'server/src/hotel-service.ts',
  'server/src/hotel-service.test.ts',
  'server/src/env.ts',
];
const HOTEL_FORMS = ['shared/src/forms.ts', 'shared/src/forms.test.ts', 'shared/scripts/generate-forms.ts'];
const HOTEL_DEMOS = {
  'agui-mastra-hotel-booking-compare': [...HOTEL_CORE, ...HOTEL_FORMS],
  'agui-mastra-hotel-booking-a2ui': HOTEL_CORE,
  'agui-mastra-hotel-booking-golemui': [...HOTEL_CORE, ...HOTEL_FORMS],
  'genkit-hotel-booking-compare': [...HOTEL_CORE, ...HOTEL_FORMS],
  'genkit-hotel-booking-a2ui': HOTEL_CORE,
  'genkit-hotel-booking-golemui': [...HOTEL_CORE, ...HOTEL_FORMS],
};

const banner = (source) =>
  `/* AUTO-GENERATED from ${source} — edit there and run \`npm run sync\`. Do not edit here. */\n`;

const generatedPaths = [
  ...SHELL_DEMOS.map((demo) => join(demo, SHELL_DEST)),
  ...Object.entries(HOTEL_DEMOS).flatMap(([demo, files]) => files.map((file) => join(demo, file))),
];

if (process.argv.includes('--paths')) {
  console.log(generatedPaths.join('\n'));
  process.exit(0);
}

/** Writes a read-only copy (to discourage editing it; git tracks only the executable bit, so no mode diffs). */
function writeCopy(target, content) {
  rmSync(target, { force: true });
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  chmodSync(target, 0o444);
}

const shellFiles = readdirSync(SHELL_SOURCE).filter((f) => statSync(join(SHELL_SOURCE, f)).isFile());
if (shellFiles.length === 0) {
  console.error('sync-shared: no files found in /shared');
  process.exit(1);
}

for (const demo of SHELL_DEMOS) {
  const dest = join(ROOT, demo, SHELL_DEST);
  // Start clean so renamed/removed files don't linger (files are read-only,
  // but the directory is writable so removal succeeds).
  rmSync(dest, { recursive: true, force: true });
  for (const file of shellFiles) {
    writeCopy(join(dest, file), banner(`shared/${file}`) + readFileSync(join(SHELL_SOURCE, file), 'utf8'));
  }
}

for (const [demo, files] of Object.entries(HOTEL_DEMOS)) {
  for (const file of files) {
    writeCopy(join(ROOT, demo, file), banner(`shared/hotel/${file}`) + readFileSync(join(HOTEL_SOURCE, file), 'utf8'));
  }
}

console.log(
  `sync-shared: copied ${shellFiles.length} shell file(s) into ${SHELL_DEMOS.length} demos, ` +
    `and the hotel core into ${Object.keys(HOTEL_DEMOS).join(', ')}`,
);
