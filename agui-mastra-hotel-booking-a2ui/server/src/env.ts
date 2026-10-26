/* AUTO-GENERATED from shared/hotel/server/src/env.ts — edit there and run `npm run sync`. Do not edit here. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads local development credentials before anything else reads process.env.
 * Imported first by server.ts so it runs ahead of every module-scope
 * `process.env` read (e.g. AGENT_MODEL in agent.ts).
 *
 * Sources, in priority order — the first value found for a key wins, and real
 * environment variables always beat files:
 *   1. process.env itself (`ANTHROPIC_API_KEY=… npm run dev`)
 *   2. a `.env` file (KEY=value lines) in server/, the demo root, or the repo root
 *   3. a bare `ANTHROPIC_API_KEY` file (the key as the file's only content) in
 *      the same folders — handy for dropping a key without writing a .env
 *
 * All of these file names are listed in the repo .gitignore. Only the source
 * path is ever logged, never a value.
 */

const roots = [process.cwd(), resolve(process.cwd(), '..'), resolve(process.cwd(), '../..')];

const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile();

function setIfMissing(key: string, value: string, source: string): void {
  if (!(key in process.env) && value) {
    process.env[key] = value;
    console.log(`[env] ${key} loaded from ${source}`);
  }
}

for (const root of roots) {
  const envFile = resolve(root, '.env');
  if (!isFile(envFile)) continue;
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2].replace(/^(["'])(.*)\1$/, '$2'); // strip matching quotes
    setIfMissing(match[1], value, envFile);
  }
}

for (const root of roots) {
  const keyFile = resolve(root, 'ANTHROPIC_API_KEY');
  if (isFile(keyFile)) {
    setIfMissing('ANTHROPIC_API_KEY', readFileSync(keyFile, 'utf8').trim(), keyFile);
  }
}
