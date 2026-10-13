import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFormDefinition } from '@golemui/gui-mcp/json';
import { ASKABLE_OPERATIONS } from './hotel-api';
import { formForOperation, operationFields } from './forms';
import { bookingProblems, priceBooking } from './pricing';

const paths = (form: { form: unknown[] }): string[] =>
  JSON.stringify(form)
    .match(/"path":"[^"]+"/g)!
    .map((match) => match.slice(8, -1));

test('every full operation form is a valid GolemUI definition', () => {
  for (const operation of ASKABLE_OPERATIONS) {
    const result = validateFormDefinition({ formDefinition: formForOperation({ operation }) });
    assert.equal(result.valid, true, `${operation}: ${JSON.stringify(result)}`);
  }
});

test('every single-field slice is valid and keeps only that field', () => {
  for (const operation of ASKABLE_OPERATIONS) {
    for (const { name } of operationFields(operation)) {
      const definition = formForOperation({ operation, fields: [name], submitLabel: 'Continue' });
      const result = validateFormDefinition({ formDefinition: definition });
      assert.equal(result.valid, true, `${operation}.${name}: ${JSON.stringify(result)}`);
      assert.ok(paths(definition).every((path) => path === name || path.startsWith(`${name}.`)), `${operation}.${name}`);
    }
  }
});

test('special requests are asked one by one, inside a titled section', () => {
  const definition = formForOperation({ operation: 'createBooking', fields: ['specialRequests.babyCrib', 'specialRequests.parking'] });
  assert.deepEqual(paths(definition), ['specialRequests.babyCrib', 'specialRequests.parking']);
  assert.match(JSON.stringify(definition), /"type":"accordion".*"label":"Special requests"/);
  assert.equal(validateFormDefinition({ formDefinition: definition }).valid, true);
});

test('the date pickers get the run-time floor and the datesChanged event', () => {
  const definition = formForOperation({ operation: 'createBooking', fields: ['dates'] });
  const json = JSON.stringify(definition);
  assert.match(json, /"minDate":"\d{4}-\d{2}-\d{2}"/);
  assert.match(json, /"change":"datesChanged"/);
});

test('pricing and business rules', () => {
  const booking = {
    dates: { start: '2099-01-01', end: '2099-01-08' },
    guests: 2,
    rooms: 1,
    board: 'half' as const,
    car: 'compact' as const,
  };
  // 7 nights: room 420 + guests 140 + half board 140 + compact 175
  assert.equal(priceBooking(booking).total, 875);
  assert.deepEqual(bookingProblems(booking), []);
  assert.equal(bookingProblems({ ...booking, guests: 6 }).length, 1);
  assert.equal(bookingProblems({ ...booking, dates: { start: '2099-01-01', end: '2099-03-01' } }).length, 1);
});
