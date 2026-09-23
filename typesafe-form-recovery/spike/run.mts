// Spike: text → GolemUI JSON definition. The model only classifies and picks; code assembles.
import { readFileSync, writeFileSync } from 'node:fs';
import { TypeSafeClient } from '../../typesafe-prefill/node_modules/@typesafe-ai/sdk/dist/index.mjs';

const apiKey = readFileSync('../../typesafe-prefill/.env', 'utf8').match(/TYPESAFE_API_KEY=(.+)/)![1].trim();
const client = new TypeSafeClient({ apiKey });
const NONE = 'none';

// 1. Code: split into tagged lines (the model refers to them by id).
const lines = readFileSync(process.argv[2] ?? 'input.txt', 'utf8').split('\n').map((l) => l.replace(/^[\s*\-•]+/, '').trim()).filter(Boolean);
const id = (i: number) => `L${String(i).padStart(3, '0')}`;
const state = lines.map((l, i) => `${id(i)}| ${l}`).join('\n');

// 2. Code: candidate spans per line (labels come from here, verbatim) and numbers.
const spans = (l: string) => [...new Set(l.split(/[,:;()]|\btipo\b|\bvalidaciones\b|\btype\b|\bvalidations?\b/i).map((s) => s.trim()).filter((s) => s.length > 1))];
const numbers = (l: string) => [...new Set(l.match(/\d+/g) ?? [])];

const WIDGETS = {
  textinput: 'a single-line text input', textarea: 'a multi-line text area', number: 'a numeric input', checkbox: 'a single yes/no checkbox',
  select: 'a dropdown to pick one option', radiogroup: 'radio buttons to pick one option', multiList: 'a list to pick several options', datePicker: 'a date picker',
};

// 3. One request: every question for every line, speculatively.
const questions: Record<string, any> = {};
lines.forEach((line, i) => {
  const L = id(i);
  questions[`${L}.role`] = { type: 'choice', instructions: `What is line ${L}?`, criteria: { field: 'It describes one form field to create', intro: 'It introduces the form or says how many fields there are', other: 'Anything else' } };
  questions[`${L}.widget`] = { type: 'choice', instructions: `If line ${L} describes a form field, which widget fits it best?`, criteria: WIDGETS };
  questions[`${L}.label`] = { type: 'choice', instructions: `Which of these spans is the label (the name) of the field described in line ${L}?`, criteria: { ...Object.fromEntries(spans(line).map((s) => [s, null])), [NONE]: 'None of them' } };
  questions[`${L}.required`] = { type: 'noul', instructions: `Does line ${L} say the field is required / mandatory?` };
  questions[`${L}.email`] = { type: 'noul', instructions: `Does line ${L} say the value must be an email address?` };
  questions[`${L}.maxLength`] = { type: 'choice', instructions: `Which number in line ${L} is the field's MAXIMUM length?`, criteria: { ...Object.fromEntries(numbers(line).map((n) => [n, null])), [NONE]: 'No maximum length is given' } };
  questions[`${L}.minLength`] = { type: 'choice', instructions: `Which number in line ${L} is the field's MINIMUM length?`, criteria: { ...Object.fromEntries(numbers(line).map((n) => [n, null])), [NONE]: 'No minimum length is given' } };
});

const t0 = performance.now();
const r: any = await client.systemOne({ state, questions });
console.log(`${Object.keys(questions).length} questions, ${Math.round(performance.now() - t0)} ms, ${r.usage.input_tokens} tokens\n`);

// 4. Code: assemble the definition from the answers.
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('');
const form: any[] = [];
lines.forEach((line, i) => {
  const L = id(i);
  const a = (k: string) => r.answers[`${L}.${k}`];
  const role = a('role');
  console.log(`${L} role=${role.choice} (${role.confidence.toFixed(2)})  widget=${a('widget').choice} (${a('widget').confidence.toFixed(2)})  label=${a('label').choice} (${a('label').confidence.toFixed(2)})  required=${a('required').noul.toFixed(2)}  email=${a('email').noul.toFixed(2)}  max=${a('maxLength').choice}  min=${a('minLength').choice}`);
  if (role.choice !== 'field' || a('label').choice === NONE) return;

  const type = a('widget').choice;
  const label = a('label').choice;
  const widget: any = { kind: 'input', type, path: slug(label), label };
  const validator: any = {};
  if (type === 'textinput' || type === 'textarea') {
    validator.type = 'string';
    if (a('required').noul >= 0.7) validator.required = true;
    if (a('email').noul >= 0.7) validator.format = 'email';
    if (a('maxLength').choice !== NONE) validator.maxLength = Number(a('maxLength').choice);
    if (a('minLength').choice !== NONE) validator.minLength = Number(a('minLength').choice);
  } else if (type === 'checkbox' && a('required').noul >= 0.7) {
    Object.assign(validator, { type: 'boolean', required: true, const: true });
  }
  if (Object.keys(validator).length) widget.validator = validator;
  form.push(widget);
});
form.push({ kind: 'action', type: 'button', label: 'Submit', actionType: 'submit' });
const definition = { $schema: 'https://golemui.com/schemas/form.schema.json', form };
writeFileSync('out.json', JSON.stringify(definition, null, 2));
console.log('\n' + JSON.stringify(definition, null, 2));
