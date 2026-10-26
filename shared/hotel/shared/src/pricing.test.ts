import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingProblems, priceBooking } from './pricing';

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
