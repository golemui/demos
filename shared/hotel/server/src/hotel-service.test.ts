import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as service from './hotel-service';

test('the mock API enforces the contract and business rules', () => {
  assert.throws(() => service.createBooking({ guests: 2 }), /required/);
  assert.throws(
    () => service.createBooking({ dates: { start: '2099-01-01', end: '2099-01-03' }, guests: 9, rooms: 1, board: 'none', car: 'none' }),
    /at least 3 rooms/,
  );
  assert.throws(
    () => service.createBooking({ dates: { start: '2099-01-01', end: '2099-01-03' }, guests: 2, rooms: 1, board: 'gold', car: 'none' }),
    /board/,
  );
  assert.throws(
    () =>
      service.createBooking({
        dates: { start: '2099-01-01', end: '2099-01-03' },
        guests: 2,
        rooms: 1,
        board: 'none',
        car: 'none',
        specialRequests: { dietary: 'carnivore' },
      }),
    /specialRequests\.dietary/,
  );
  assert.equal(service.checkAvailability({ dates: { start: '2099-05-01', end: '2099-05-03' }, rooms: 2 }).available, true);

  const booking = service.createBooking({ dates: { start: '2099-06-01', end: '2099-06-03' }, guests: 2, rooms: 1, board: 'none', car: 'none' });
  assert.throws(() => service.updateBooking(booking.id, { guests: 9 }), /at least 3 rooms/);
  assert.throws(() => service.updateBooking('AUR-0', { car: 'suv' }), /not found/);
  service.createPayment({ bookingId: booking.id, amount: booking.total, brand: 'visa', last4: '4242' });
  assert.throws(() => service.updateBooking(booking.id, { car: 'suv' }), /already paid/);
});
