// Runs the demo's real modules (two passes) against the TypeSafe API and validates each result.
// Usage, from this folder: node --experimental-strip-types live.mts
import { readFileSync, writeFileSync } from 'node:fs';
import { TypeSafeClient } from '../../typesafe-prefill/node_modules/@typesafe-ai/sdk/dist/index.mjs';
import { splitSpans, state, catalogQuestions, fieldQuestions } from '../src/questions.ts';
import { assemble } from '../src/assemble.ts';
import { SAMPLES } from '../src/samples.ts';
const apiKey = readFileSync('../.env', 'utf8').match(/TYPESAFE_API_KEY=(.+)/)![1].trim();
const client = new TypeSafeClient({ apiKey });
const fixtures: any = {};
for (const sample of SAMPLES) {
  const spans = splitSpans(sample.text);
  const shared = state(sample.text, spans);
  const t0 = performance.now();
  const catalog: any = await client.systemOne({ state: shared, questions: catalogQuestions(spans) });
  const roles = Object.fromEntries(spans.map((s) => [s.id, catalog.answers[`${s.id}.role`].choice]));
  const fq = fieldQuestions(spans, roles);
  const described: any = Object.keys(fq).length ? await client.systemOne({ state: shared, questions: fq }) : { answers: {}, usage: { input_tokens: 0 } };
  const ms = Math.round(performance.now() - t0);
  const { definition, decisions } = assemble(spans, catalog.answers, described.answers);
  console.log(`\n=== ${sample.name}: ${spans.length} spans, ${spans.length + Object.keys(fq).length} questions, ${ms} ms, ${catalog.usage.input_tokens + described.usage.input_tokens} tok`);
  for (const d of decisions) console.log('  ' + d.role.padEnd(10) + d.text.slice(0, 34).padEnd(36) + (d.widget ? d.widget.padEnd(11) + 'req ' + d.required!.toFixed(2) + (d.options ? '  opts: ' + d.options.join(' | ') : '') : ''));
  writeFileSync('out-' + sample.name.replace(/\W+/g, '-').toLowerCase() + '.json', JSON.stringify(definition, null, 2));
  fixtures[sample.name] = [catalog, described];
}
writeFileSync('fixtures.json', JSON.stringify(fixtures));
