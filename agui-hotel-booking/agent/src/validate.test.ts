import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFormDef } from './validate.js';

const validForm = {
  form: [
    {
      kind: 'input',
      type: 'textinput',
      path: 'name',
      label: 'Name',
      validator: {
        type: 'string',
        required: true,
        messages: { invalid: 'Name is required', required: 'Name is required' },
      },
    },
    { kind: 'action', type: 'button', actionType: 'submit', label: 'Send' },
  ],
};

test('accepts a valid form definition', () => {
  const outcome = validateFormDef(validForm);
  assert.equal(outcome.valid, true);
  assert.equal(outcome.report, '');
});

test('rejects a broken widget type with an actionable report', () => {
  const broken = {
    form: [{ kind: 'input', type: 'textinputt', path: 'name', label: 'Name' }],
  };
  const outcome = validateFormDef(broken);
  assert.equal(outcome.valid, false);
  assert.match(outcome.report, /INVALID/);
  assert.match(outcome.report, /textinputt|type/);
});

test('rejects a non-object formDef', () => {
  const outcome = validateFormDef([{ kind: 'action', type: 'button' }]);
  assert.equal(outcome.valid, false);
  assert.match(outcome.report, /must be an object/);
});
