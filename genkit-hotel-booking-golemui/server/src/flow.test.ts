import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { remoteAgent } from 'genkit/beta/client';
import { a2uiEnvelopesFromParts, actionToMessage, type A2uiServerEnvelope } from '@genkit-ai/a2ui/client';
import { BOOKING_REVIEW, CHECKOUT, CONTRACT_FORM, HOTEL_CATALOG_ID, HOTEL_EVENTS } from '@hotel/shared';

/**
 * The whole conversation end to end over HTTP — the real server, the real Genkit agent
 * and the real a2ui() middleware, with the scripted mock model standing in for
 * the LLM and this test standing in for the browser (it "clicks" by sending
 * the A2UI actions the renderer would send).
 */

const PORT = 8790;
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess;

before(async () => {
  server = spawn('npx', ['tsx', 'src/server.ts'], { env: { ...process.env, MOCK_AGENT: '1', SERVER_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(`${BASE}/api/hotel/bookings`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error('server did not start');
});
after(() => server.kill());

type Component = { id: string; component: string; [key: string]: unknown };

async function turn(chat: ReturnType<ReturnType<typeof remoteAgent>['chat']>, input: Parameters<typeof chat.sendStream>[0]) {
  const t = chat.sendStream(input);
  let text = '';
  const envelopes: A2uiServerEnvelope[] = [];
  for await (const chunk of t.stream) {
    text += chunk.text ?? '';
    envelopes.push(...a2uiEnvelopesFromParts(chunk.raw.modelChunk?.content));
  }
  await t.response;
  const create = envelopes.find((e) => 'createSurface' in e) as { createSurface: { surfaceId: string; catalogId: string } } | undefined;
  const components = envelopes.flatMap((e) => ('updateComponents' in e ? (e.updateComponents as { components: Component[] }).components : []));
  const data = envelopes.find((e) => 'updateDataModel' in e) as { updateDataModel: { value: Record<string, unknown> } } | undefined;
  return { text, surface: create?.createSurface, components, data: data?.updateDataModel.value };
}

const click = (surfaceId: string, name: string, context: Record<string, unknown>) =>
  ({ message: actionToMessage({ name, surfaceId, sourceComponentId: 'root', timestamp: new Date().toISOString(), context }) }) as never;

const find = (components: Component[], type: string) => components.find((c) => c.component === type)!;

test('the agent only picks operation + fields; the app books and charges', { timeout: 60_000 }, async () => {
  const chat = remoteAgent({ url: `${BASE}/api/agent`, stateManagement: 'client' }).chat();

  let t = await turn(chat, 'We are 6 people and travel with a baby, need parking');
  assert.equal(t.surface?.catalogId, HOTEL_CATALOG_ID);
  assert.notEqual(t.surface?.surfaceId, 'SURFACE_ID', 'middleware assigns a real surface id');
  let form = find(t.components, CONTRACT_FORM);
  assert.deepEqual(form.fields, ['dates', 'rooms', 'board', 'car']);
  assert.equal((form.prefill as { rooms: number }).rooms, 2);

  // The ContractForm fires its event with the API-shaped values.
  t = await turn(chat, click(t.surface!.surfaceId, 'booking_details', {
    values: { dates: { start: '2099-03-01', end: '2099-03-08' }, rooms: 2, board: 'half', car: 'none' },
  }));
  form = find(t.components, CONTRACT_FORM);
  assert.deepEqual(form.fields, ['specialRequests.babyCrib', 'specialRequests.parking', 'specialRequests.licensePlate']);

  t = await turn(chat, click(t.surface!.surfaceId, 'special_requests', {
    values: { specialRequests: { babyCrib: true, parking: true, licensePlate: '1234 ABC' } },
  }));
  const review = find(t.components, BOOKING_REVIEW);
  assert.deepEqual(review.proposal, {
    guests: 6,
    car: 'none',
    dates: { start: '2099-03-01', end: '2099-03-08' },
    rooms: 2,
    board: 'half',
    specialRequests: { babyCrib: true, parking: true, licensePlate: '1234 ABC' },
  });

  // BookingReview: the APP creates the booking, then fires the event.
  const booking = await (await fetch(`${BASE}/api/hotel/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...(review.proposal as object), board: 'full' }),
  })).json();
  t = await turn(chat, click(t.surface!.surfaceId, HOTEL_EVENTS.bookingConfirmed, {
    booking: { id: booking.id, total: booking.total, nights: booking.nights },
    humanChanges: [{ path: 'board', proposed: 'half', approved: 'full' }],
  }));
  assert.match(t.text, /board → full/);
  const checkout = find(t.components, CHECKOUT);
  assert.deepEqual({ bookingId: checkout.bookingId, amount: checkout.amount }, { bookingId: booking.id, amount: booking.total });

  t = await turn(chat, click(t.surface!.surfaceId, HOTEL_EVENTS.paymentCompleted, { bookingId: booking.id, amount: booking.total, brand: 'visa', last4: '4242' }));
  assert.match(t.text, /visa ending 4242/);
});

test('closing the checkout → change the booking (PATCH, same id) → pay', { timeout: 60_000 }, async () => {
  const chat = remoteAgent({ url: `${BASE}/api/agent`, stateManagement: 'client' }).chat();
  let t = await turn(chat, 'Book a room for 2 people next week, half board');
  t = await turn(chat, click(t.surface!.surfaceId, 'booking_details', {
    values: { dates: { start: '2099-05-01', end: '2099-05-04' }, rooms: 1, car: 'none' },
  }));
  const proposal = find(t.components, BOOKING_REVIEW).proposal as Record<string, unknown>;
  const created = await (await fetch(`${BASE}/api/hotel/bookings`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(proposal),
  })).json();
  t = await turn(chat, click(t.surface!.surfaceId, HOTEL_EVENTS.bookingConfirmed, { booking: created, humanChanges: [] }));
  assert.ok(find(t.components, CHECKOUT));

  // The guest closes the checkout: the agent offers to change the booking.
  t = await turn(chat, click(t.surface!.surfaceId, HOTEL_EVENTS.paymentCancelled, {}));
  assert.match(t.text, /change anything/);

  // "Add a car" → a ContractForm for updateBooking with just that field.
  t = await turn(chat, 'Yes, I want to rent a car please');
  const form = find(t.components, CONTRACT_FORM);
  assert.deepEqual({ operation: form.operation, fields: form.fields }, { operation: 'updateBooking', fields: ['car'] });

  t = await turn(chat, click(t.surface!.surfaceId, 'booking_changes', { values: { car: 'suv' } }));
  const review = find(t.components, BOOKING_REVIEW);
  assert.equal(review.bookingId, created.id, `the review updates the existing booking: ${JSON.stringify(t.components)}`);
  assert.equal((review.proposal as { car: string }).car, 'suv');

  // BookingReview with a bookingId → the app PATCHes: same id, new price.
  const updated = await (await fetch(`${BASE}/api/hotel/bookings/${created.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(review.proposal),
  })).json();
  assert.equal(updated.id, created.id, `PATCH answered ${JSON.stringify(updated)}`);
  assert.equal(updated.total, created.total + 3 * 30, 'SUV adds €30/night');
  t = await turn(chat, click(t.surface!.surfaceId, HOTEL_EVENTS.bookingConfirmed, { booking: updated, humanChanges: [] }));
  assert.equal(find(t.components, CHECKOUT).amount, updated.total);
});
