// Calibration run: `cd spike && node --experimental-strip-types run.mts` (after `npm install` in the demo folder and a `.env` with the key).
import { readFileSync } from 'node:fs';
import { TypeSafeClient } from '@typesafe-ai/sdk';
const apiKey = readFileSync('../.env', 'utf8').match(/TYPESAFE_API_KEY=(.+)/)![1].trim();
const client = new TypeSafeClient({ apiKey });
const story = JSON.parse(readFileSync('./story.json', 'utf8'));
const summaries = JSON.parse(readFileSync('./summaries.json', 'utf8'));

const storyText = story.chapters.join('\n\n');
const questions: Record<string, any> = {};
for (const [id, fact] of Object.entries(story.facts)) {
  questions['fact_' + id] = { type: 'noul', instructions: 'Does `summary` mention or clearly imply that ' + fact + '? Judge meaning, not wording or grammar.' };
}
questions.on_topic = { type: 'noul', instructions: 'Is `summary` an attempt to summarise `story` (as opposed to unrelated text or a different story)?' };
questions.contradicts = { type: 'noul', instructions: 'Does `summary` state something that contradicts the events of `story`?' };
questions.spanish = { type: 'noul', instructions: 'Is `summary` written in Spanish (even with grammar mistakes)?' };
questions.completeness = { type: 'score', instructions: 'How completely does `summary` retell the events of `story`?', criteria: [
  'Says nothing about the events of the story',
  'Mentions only the beginning (the fox is hungry / goes to the river)',
  'Covers the main events (meeting the duck, the lost hat) but not how it ends',
  'Covers all the essential events from beginning to end, including the ending',
] };

const pad = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n);
console.log(pad('summary', 18) + Object.keys(questions).map(k => pad(k.replace('fact_',''), 9)).join(''));
for (const [name, summary] of Object.entries(summaries)) {
  const t0 = performance.now();
  const r: any = await client.systemOne({ state: { story: storyText, summary }, questions });
  const ms = Math.round(performance.now() - t0);
  let line = pad(name, 18);
  for (const k of Object.keys(questions)) {
    const a = r.answers[k];
    line += pad(a.type === 'noul' ? a.noul.toFixed(2) : a.score.toFixed(2) + '/' + a.confidence.toFixed(2), 9);
  }
  console.log(line + '  ' + ms + 'ms ' + r.usage.input_tokens + 'tok');
}
