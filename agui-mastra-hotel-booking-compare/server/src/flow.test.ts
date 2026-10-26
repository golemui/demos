import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BaseEvent, Message } from '@ag-ui/core';
import { FRONTEND_TOOLS } from '@hotel/shared';

/**
 * The whole conversation through the REAL Mastra agent + AG-UI bridge, with the
 * scripted mock model standing in for the LLM and this test standing in for the
 * browser (it answers the frontend tools the way the UI would).
 */
process.env.MOCK_AGENT = '1';
const { getLocalAgent } = await import('@ag-ui/mastra');
const { mastra } = await import('./agent');
const service = await import('./hotel-service');

type ToolCall = { id: string; name: string; args: Record<string, unknown> };

async function run(messages: Message[]): Promise<{ events: BaseEvent[]; calls: ToolCall[]; text: string }> {
  const agent = getLocalAgent({ mastra, agentId: 'concierge', resourceId: 'test' });
  const events: BaseEvent[] = [];
  await new Promise<void>((resolve, reject) =>
    agent
      .run({ threadId: 't', runId: crypto.randomUUID(), messages, tools: FRONTEND_TOOLS, context: [], state: {}, forwardedProps: {} })
      .subscribe({ next: (event) => events.push(event), error: reject, complete: resolve }),
  );
  const calls = new Map<string, ToolCall & { raw: string }>();
  let text = '';
  for (const event of events as Array<BaseEvent & Record<string, string>>) {
    if (event.type === 'TOOL_CALL_START') calls.set(event.toolCallId, { id: event.toolCallId, name: event.toolCallName, args: {}, raw: '' });
    if (event.type === 'TOOL_CALL_ARGS') calls.get(event.toolCallId)!.raw += event.delta;
    if (event.type === 'TEXT_MESSAGE_CHUNK' || event.type === 'TEXT_MESSAGE_CONTENT') text += event.delta;
  }
  return {
    events,
    text,
    calls: [...calls.values()].map(({ raw, ...call }) => ({ ...call, args: JSON.parse(raw || '{}') })),
  };
}

function answer(history: Message[], text: string, call: ToolCall, result: unknown): Message[] {
  return [
    ...history,
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: text,
      toolCalls: [{ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }],
    },
    { id: crypto.randomUUID(), role: 'tool', toolCallId: call.id, content: JSON.stringify(result) },
  ];
}

test('ask what is missing → availability → special requests → review → pay', { timeout: 60_000 }, async () => {
  let history: Message[] = [
    { id: 'u1', role: 'user', content: 'Book a room for 2 people next week, half board. We travel with a baby.' },
  ];

  // 1. Only the unknown fields are asked; "next week" arrives as a suggestion.
  let turn = await run(history);
  let call = turn.calls[0];
  assert.equal(call.name, 'ask_user');
  assert.equal(call.args.operation, 'createBooking');
  assert.deepEqual(call.args.fields, ['dates', 'rooms', 'car']);
  const prefill = call.args.prefill as { dates: { start: string; end: string } };
  assert.ok(prefill.dates.start);
  history = answer(history, turn.text, call, { dates: prefill.dates, rooms: 1, car: 'compact' });

  // 2. The SERVER tool (availability) runs inside Mastra in the same run, then
  //    the agent asks — before the review — only the special request it heard.
  turn = await run(history);
  assert.ok(turn.events.some((event) => event.type === 'TOOL_CALL_RESULT'), 'server tool result streamed');
  assert.equal(turn.calls[0].name, 'check_availability');
  call = turn.calls[1];
  assert.equal(call.name, 'ask_user');
  assert.deepEqual(call.args.fields, ['specialRequests.babyCrib']);
  assert.deepEqual(call.args.prefill, { specialRequests: { babyCrib: true } });
  history = [
    ...history,
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: turn.text,
      toolCalls: turn.calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.args) } })),
    },
    { id: crypto.randomUUID(), role: 'tool', toolCallId: turn.calls[0].id, content: JSON.stringify({ available: true, roomsLeft: 6, nights: 7 }) },
    { id: crypto.randomUUID(), role: 'tool', toolCallId: call.id, content: JSON.stringify({ specialRequests: { babyCrib: true } }) },
  ];

  // 3. Full proposal — special requests included — for review.
  turn = await run(history);
  call = turn.calls[0];
  assert.equal(call.name, 'confirm_booking');
  assert.deepEqual(
    { guests: call.args.guests, rooms: call.args.rooms, board: call.args.board, car: call.args.car, specialRequests: call.args.specialRequests },
    { guests: 2, rooms: 1, board: 'half', car: 'compact', specialRequests: { babyCrib: true } },
  );
  // The "browser" approves with one edit and calls the API, like the UI does.
  const booking = service.createBooking({ ...call.args, board: 'full' });
  assert.deepEqual(booking.specialRequests, { babyCrib: true });
  history = answer(history, turn.text, call, {
    status: 'booked',
    booking: { id: booking.id, total: booking.total, nights: booking.nights },
    humanChanges: [{ path: 'board', proposed: 'half', approved: 'full' }],
  });

  // 4. Payment for the server-priced total.
  turn = await run(history);
  call = turn.calls[0];
  assert.equal(call.name, 'collect_payment');
  assert.deepEqual(call.args, { bookingId: booking.id, amount: booking.total });
  assert.match(turn.text, /board → full/);
  service.createPayment({ bookingId: booking.id, amount: booking.total, brand: 'visa', last4: '4242' });
  history = answer(history, turn.text, call, { status: 'paid', amount: booking.total, brand: 'visa', last4: '4242' });

  // 5. Done — nothing is asked after paying.
  turn = await run(history);
  assert.equal(turn.calls.length, 0);
  assert.match(turn.text, /special requests are saved/);
  assert.equal(service.listBookings().find((b) => b.id === booking.id)?.status, 'paid');
});

test('closing the checkout → change the booking (updateBooking, same id) → pay the new total', { timeout: 60_000 }, async () => {
  let history: Message[] = [{ id: 'u1', role: 'user', content: 'Book a room for 2 people next week, half board' }];

  let turn = await run(history);
  let call = turn.calls[0];
  assert.equal(call.name, 'ask_user');
  const prefill = call.args.prefill as { dates: { start: string; end: string } };
  history = answer(history, turn.text, call, { dates: prefill.dates, rooms: 1, car: 'none' });

  // Availability (server tool) then the proposal, in one run.
  turn = await run(history);
  assert.deepEqual(turn.calls.map((c) => c.name), ['check_availability', 'confirm_booking']);
  const [availability, confirm] = turn.calls;
  const created = service.createBooking(confirm.args);
  history = [
    ...history,
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: turn.text,
      toolCalls: turn.calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.args) } })),
    },
    { id: crypto.randomUUID(), role: 'tool', toolCallId: availability.id, content: JSON.stringify({ available: true, roomsLeft: 6, nights: 7 }) },
    { id: crypto.randomUUID(), role: 'tool', toolCallId: confirm.id, content: JSON.stringify({ status: 'booked', booking: { id: created.id, total: created.total, nights: created.nights }, humanChanges: [] }) },
  ];

  // The guest closes the checkout: the agent offers to change the booking.
  turn = await run(history);
  call = turn.calls[0];
  assert.equal(call.name, 'collect_payment');
  history = answer(history, turn.text, call, { status: 'cancelled' });
  turn = await run(history);
  assert.equal(turn.calls.length, 0);
  assert.match(turn.text, /change anything/);

  // "I want to rent a car" → ask_user(updateBooking) with just that field.
  history = [...history, { id: crypto.randomUUID(), role: 'assistant', content: turn.text }, { id: crypto.randomUUID(), role: 'user', content: 'Yes, I want to rent a car please' }];
  turn = await run(history);
  call = turn.calls[0];
  assert.deepEqual({ name: call.name, operation: call.args.operation, fields: call.args.fields }, { name: 'ask_user', operation: 'updateBooking', fields: ['car'] });
  history = answer(history, turn.text, call, { car: 'suv' });

  // The full updated proposal, WITH the bookingId: the app PATCHes, it doesn't create.
  turn = await run(history);
  call = turn.calls[0];
  assert.equal(call.name, 'confirm_booking');
  assert.equal(call.args.bookingId, created.id);
  assert.equal(call.args.car, 'suv');
  const { bookingId, ...proposal } = call.args;
  const before = created.total; // the mock API updates the stored booking in place
  const updated = service.updateBooking(bookingId as string, proposal);
  assert.equal(updated.id, created.id);
  assert.equal(updated.total, before + 7 * 30, 'SUV adds €30/night');
  history = answer(history, turn.text, call, { status: 'booked', booking: { id: updated.id, total: updated.total, nights: updated.nights }, humanChanges: [] });

  turn = await run(history);
  assert.deepEqual(turn.calls[0], { ...turn.calls[0], name: 'collect_payment', args: { bookingId: created.id, amount: updated.total } });
});
