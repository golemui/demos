import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hotelCatalog } from './catalogs';

const props = (name: string) => hotelCatalog.components.find((c) => c.name === name)?.props ?? '';

test('the agent is told exactly the props the renderer accepts', () => {
  // @genkit-ai/a2ui 0.6 advertised these; web_core 0.14 rejects them.
  assert.doesNotMatch(props('Slider'), /\bstep\b/);
  assert.doesNotMatch(props('List'), /listStyle/);
  // …and omitted these inputs, which the renderer does implement.
  for (const name of ['DateTimeInput', 'ChoicePicker', 'TextField', 'CheckBox', 'Button']) {
    assert.ok(props(name), `${name} is described`);
  }
  assert.match(props('ChoicePicker'), /value: string\[\]/);
});

test('the hotel catalog = the basic components + the GolemUI-backed ones', () => {
  const names = hotelCatalog.components.map((c) => c.name);
  for (const name of ['Slider', 'ChoicePicker', 'ContractForm', 'BookingReview', 'Checkout']) assert.ok(names.includes(name), name);
});

test('a misplaced "version" inside a message is repaired before the strict renderer', async () => {
  const { MessageProcessor } = await import('@a2ui/web_core/v0_9');
  const { basicCatalog } = await import('@a2ui/web_core/v0_9/basic_catalog');
  const { normalizeEnvelopes } = await import('@hotel/shared');
  // What Claude wrote after seeing earlier (version-stamped) surfaces in the history.
  const fromModel = [
    { version: 'v0.9', createSurface: { surfaceId: 's1', catalogId: basicCatalog.id } },
    { version: 'v0.9', updateComponents: { version: 'v0.9', surfaceId: 's1', components: [{ id: 'root', component: 'Text', text: 'hi' }] } },
  ];
  assert.throws(() => new MessageProcessor([basicCatalog]).processMessages(fromModel as never), /Unrecognized key\(s\) in object: 'version'/);
  const { envelopes, repaired } = normalizeEnvelopes(fromModel);
  assert.equal(repaired, 1);
  assert.doesNotThrow(() => new MessageProcessor([basicCatalog]).processMessages(envelopes as never));
});
