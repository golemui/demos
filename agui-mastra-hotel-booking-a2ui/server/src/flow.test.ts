import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { HttpAgent } from '@ag-ui/client';
import type { ActivityMessage, AssistantMessage, Message } from '@ag-ui/core';
import { LOG_A2UI_EVENT_TOOL_NAME } from '@hotel/shared';

/**
 * The whole conversation end to end over HTTP: the real server, the real Mastra
 * agent and the real @ag-ui/a2ui-middleware, with the scripted mock model
 * standing in for the LLM and an AG-UI HttpAgent standing in for the browser
 * (it "clicks" by sending A2UI actions in forwardedProps, like the app).
 */

const PORT = 8788;
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess;

before(async () => {
  server = spawn('npx', ['tsx', 'src/server.ts'], { env: { ...process.env, MOCK_AGENT: '1', SERVER_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(`${BASE}/api/bookings`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error('server did not start');
});
after(() => server.kill());

type Component = { id: string; component: string; [key: string]: unknown };
type Operation = { createSurface?: { surfaceId: string; catalogId: string }; updateComponents?: { components: Component[] }; updateDataModel?: { value: unknown } };

/** The browser side: the app's agentStore, minus React. */
function guest() {
  const agent = new HttpAgent({ url: `${BASE}/agui` });
  const turn = async (run: () => Promise<unknown>) => {
    const before = agent.messages.length;
    await run();
    const added = agent.messages.slice(before);
    const surface = [...added].reverse().find((m): m is ActivityMessage => m.role === 'activity');
    const operations = ((surface?.content as { a2ui_operations?: Operation[] })?.a2ui_operations ?? []) as Operation[];
    const toolCalls = added.flatMap((m) => (m.role === 'assistant' ? ((m as AssistantMessage).toolCalls ?? []) : []));
    return {
      text: added.filter((m) => m.role === 'assistant').map((m) => (m as AssistantMessage).content ?? '').join(''),
      surfaceId: operations.find((op) => op.createSurface)?.createSurface?.surfaceId,
      catalogId: operations.find((op) => op.createSurface)?.createSurface?.catalogId,
      components: operations.flatMap((op) => op.updateComponents?.components ?? []),
      calls: toolCalls.map((call) => ({ name: call.function.name, args: JSON.parse(call.function.arguments || '{}') })),
    };
  };
  return {
    agent,
    say: (text: string) =>
      turn(async () => {
        agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text });
        await agent.runAgent({ tools: [] });
      }),
    /** An A2UI action, sent the AG-UI way — and mirrored into the history, as the app does. */
    click: (surfaceId: string, name: string, context: Record<string, unknown>) =>
      turn(async () => {
        const action = { name, surfaceId, sourceComponentId: 'submit', timestamp: new Date().toISOString(), context };
        const at = agent.messages.length;
        await agent.runAgent({ tools: [], forwardedProps: { a2uiAction: { userAction: action } } });
        const id = crypto.randomUUID();
        const mirror: Message[] = [
          { id: `${id}-call`, role: 'assistant', content: '', toolCalls: [{ id, type: 'function', function: { name: LOG_A2UI_EVENT_TOOL_NAME, arguments: JSON.stringify(action) } }] },
          { id: `${id}-result`, role: 'tool', toolCallId: id, content: `User performed action "${name}" on surface "${surfaceId}" (component: submit). Context: ${JSON.stringify(context)}` },
        ];
        agent.setMessages([...agent.messages.slice(0, at), ...mirror, ...agent.messages.slice(at)]);
      }),
  };
}

test('A2UI over AG-UI: the agent designs every surface and relays the data to the API', { timeout: 60_000 }, async () => {
  const { agent, say, click } = guest();

  // 1. A whole form, written by the agent with the basic catalog.
  let t = await say('We are 6 people and travel with a baby, need parking');
  assert.equal(t.catalogId, 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json');
  assert.ok(t.components.some((c) => c.component === 'DateTimeInput'));
  assert.ok(t.components.some((c) => c.component === 'ChoicePicker'));
  assert.ok(t.calls.some((call) => call.name === 'render_a2ui'));

  // 2. What the form sends back is in ITS shape; the agent translates it for the API.
  t = await click(t.surfaceId!, 'booking_details', {
    booking: { arrival: '2099-04-01', departure: '2099-04-08', guests: '6', rooms: '2', board: ['half'], car: ['none'] },
  });
  const availability = t.calls.find((call) => call.name === 'check_availability');
  assert.deepEqual(availability?.args, { dates: { start: '2099-04-01', end: '2099-04-08' }, rooms: 2 });
  assert.ok(t.components.some((c) => c.component === 'CheckBox'), 'special requests form');

  // 3. Review card, priced by a server tool.
  t = await click(t.surfaceId!, 'special_requests', { specialRequests: { babyCrib: true, parking: true, licensePlate: '5678 XYZ' } });
  assert.ok(t.calls.some((call) => call.name === 'quote_booking'));
  assert.ok(t.components.some((c) => typeof c.text === 'string' && /Total: €/.test(c.text)), 'review card with a total');

  // 4. The AGENT creates the booking (the history kept the earlier answers).
  t = await click(t.surfaceId!, 'confirm_booking', {});
  const created = t.calls.find((call) => call.name === 'create_booking');
  assert.equal(created?.args.guests, 6);
  assert.equal(created?.args.board, 'half');
  assert.match(t.text, /Booking AUR-\d+ is reserved/);

  // 5. The card form's whole context goes to the agent — the number included.
  t = await click(t.surfaceId!, 'pay', { card: { holder: 'Ada', number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' } });
  assert.match(t.text, /visa ending 4242/);
  assert.ok(
    agent.messages.some((m) => m.role === 'tool' && String(m.content).includes('4242 4242 4242 4242')),
    'the full card number is in the agent’s history',
  );

  const stored = (await (await fetch(`${BASE}/api/bookings`)).json()) as Array<{ status: string; specialRequests?: { licensePlate?: string } }>;
  assert.ok(stored.some((b) => b.status === 'paid' && b.specialRequests?.licensePlate === '5678 XYZ'));
});

test('"before paying, I want to rent a car" → update_booking, not a second booking', { timeout: 60_000 }, async () => {
  const before = ((await (await fetch(`${BASE}/api/bookings`)).json()) as unknown[]).length;
  const { say, click } = guest();
  let t = await say('Book a room for 2 people next week, half board');
  t = await click(t.surfaceId!, 'booking_details', {
    booking: { arrival: '2099-07-01', departure: '2099-07-03', guests: '2', rooms: '1', board: ['half'], car: ['none'] },
  });
  t = await click(t.surfaceId!, 'confirm_booking', {});
  const id = /Booking (AUR-\d+)/.exec(t.text)![1];

  t = await say('Before paying, I want to rent a car please');
  assert.ok(t.components.some((c) => c.component === 'ChoicePicker'), 'a form for just the car');
  t = await click(t.surfaceId!, 'booking_changes', { changes: { car: ['compact'] } });
  assert.deepEqual(t.calls.find((call) => call.name === 'update_booking')?.args, { bookingId: id, changes: { car: 'compact' } });
  assert.match(t.text, new RegExp(`booking ${id} now comes to`));

  const stored = (await (await fetch(`${BASE}/api/bookings`)).json()) as Array<{ id: string; car: string }>;
  assert.equal(stored.length, before + 1, 'still one booking for this conversation');
  assert.equal(stored.find((b) => b.id === id)?.car, 'compact');
});
