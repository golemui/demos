import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { remoteAgent } from 'genkit/beta/client';
import { a2uiEnvelopesFromParts, actionToMessage, type A2uiServerEnvelope } from '@genkit-ai/a2ui/client';
import { BASIC_CATALOG_ID } from '@hotel/shared';

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

test('the agent composes every form and relays the data to the API', { timeout: 60_000 }, async () => {
  const chat = remoteAgent({ url: `${BASE}/api/agent`, stateManagement: 'client' }).chat();

  let t = await turn(chat, 'We are 6 people and travel with a baby, need parking');
  assert.equal(t.surface?.catalogId, BASIC_CATALOG_ID);
  assert.ok(t.components.some((c) => c.component === 'DateTimeInput'));
  assert.ok(t.components.some((c) => c.component === 'ChoicePicker'));

  // What the basic form sends back: its own shape, not the API's.
  t = await turn(chat, click(t.surface!.surfaceId, 'booking_details', {
    booking: { arrival: '2099-04-01', departure: '2099-04-08', guests: '6', rooms: '2', board: ['half'], car: ['none'] },
  }));
  assert.ok(t.components.some((c) => c.component === 'CheckBox'));

  t = await turn(chat, click(t.surface!.surfaceId, 'special_requests', {
    specialRequests: { babyCrib: true, parking: true, licensePlate: '5678 XYZ' },
  }));
  assert.ok(t.components.some((c) => typeof c.text === 'string' && /Total: €/.test(c.text as string)), 'review card with a total');

  t = await turn(chat, click(t.surface!.surfaceId, 'confirm_booking', {}));
  assert.match(t.text, /Booking AUR-\d+ is reserved/);

  t = await turn(chat, click(t.surface!.surfaceId, 'pay', { card: { holder: 'Ada', number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' } }));
  assert.match(t.text, /visa ending 4242/);

  const stored = (await (await fetch(`${BASE}/api/hotel/bookings`)).json()) as Array<{ status: string; specialRequests?: { licensePlate?: string } }>;
  assert.ok(stored.some((b) => b.status === 'paid' && b.specialRequests?.licensePlate === '5678 XYZ'));
});

test('"before paying, I want to rent a car" → update_booking, not a second booking', { timeout: 60_000 }, async () => {
  const before = ((await (await fetch(`${BASE}/api/hotel/bookings`)).json()) as unknown[]).length;
  const chat = remoteAgent({ url: `${BASE}/api/agent`, stateManagement: 'client' }).chat();
  let t = await turn(chat, 'Book a room for 2 people next week, half board');
  t = await turn(chat, click(t.surface!.surfaceId, 'booking_details', {
    booking: { arrival: '2099-06-01', departure: '2099-06-03', guests: '2', rooms: '1', board: ['half'], car: ['none'] },
  }));
  t = await turn(chat, click(t.surface!.surfaceId, 'confirm_booking', {}));
  const id = /Booking (AUR-\d+)/.exec(t.text)![1];

  t = await turn(chat, 'Before paying, I want to rent a car please');
  assert.ok(t.components.some((c) => c.component === 'ChoicePicker'));
  t = await turn(chat, click(t.surface!.surfaceId, 'booking_changes', { changes: { car: ['compact'] } }));
  assert.match(t.text, new RegExp(`booking ${id} now comes to`));

  const stored = (await (await fetch(`${BASE}/api/hotel/bookings`)).json()) as Array<{ id: string; car: string }>;
  assert.equal(stored.length, before + 1, 'still one booking for this conversation');
  assert.equal(stored.find((b) => b.id === id)?.car, 'compact');
});
