/**
 * Reads the exact text an agent would read: a file of the skill, optionally cut
 * down to one or more headings. Nothing is reflowed or cleaned up — if the
 * markdown is confusing as written, the test should see it as written.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Mutation } from './spec.js';

export function readSkillText(skillDir: string, file: string, sections: string[]): string {
  const source = readFileSync(join(skillDir, file), 'utf8');
  if (sections.length === 0) return source.trim();
  return sections.map((s) => sliceSection(source, s, file)).join('\n\n');
}

/**
 * From the heading whose text equals `title` (any level, case-insensitive) up to
 * the next heading of the same or a higher level. The heading line is kept so the
 * model sees the section's name.
 */
export function sliceSection(source: string, title: string, file: string): string {
  const lines = source.split('\n');
  const wanted = title.trim().toLowerCase();
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i] ?? '');
    if (m && m[2]!.toLowerCase() === wanted) {
      start = i;
      level = m[1]!.length;
      break;
    }
  }
  if (start < 0) {
    const headings = lines.filter((l) => /^#{1,6}\s/.test(l)).map((l) => '  ' + l.trim());
    throw new Error(`section "${title}" not found in ${file}. Headings:\n${headings.join('\n')}`);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s/.exec(lines[i] ?? '');
    if (m && m[1]!.length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

/**
 * Applies a mutation. Needles are matched ignoring how the markdown is wrapped:
 * any run of whitespace in the needle matches any run of whitespace in the text,
 * so a sentence that spans two lines in SKILL.md can be quoted on one line in YAML.
 * Every needle must match at least once — a mutation that edits nothing is a
 * broken test, not a passing one.
 */
export function applyMutation(text: string, mutation: Mutation): string {
  let out = text;
  for (const needle of mutation.remove ?? []) out = replaceAllLoose(out, needle, '', mutation.id);
  for (const { find, with: repl } of mutation.replace ?? []) out = replaceAllLoose(out, find, repl, mutation.id);
  if (mutation.append) out = `${out}\n\n${mutation.append}`;
  return out;
}

function replaceAllLoose(text: string, needle: string, replacement: string, mutationId: string): string {
  const pattern = needle
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  const re = new RegExp(pattern, 'g');
  if (!re.test(text)) {
    throw new Error(`mutation "${mutationId}": text not found in the skill:\n  ${needle}`);
  }
  return text.replace(re, replacement);
}
