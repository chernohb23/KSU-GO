import assert from 'node:assert/strict';
import test from 'node:test';

import { OrganizerSession } from '../organizer/session.ts';
import { WeekChoices } from '../week/choices.ts';
import { DemoStorage } from './demoStorage.ts';
import { accountPrefix, GUEST_ACCOUNT, scopedStorage } from './scopedStorage.ts';
import { discardLegacyRegistrations, loadRegisteredEventIds, saveRegisteredEventIds, saveServerUrlOverride } from './storage.ts';

function deviceStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
    getAllKeys: async () => [...values.keys()],
    multiRemove: async (keys) => { for (const key of keys) values.delete(key); },
  };
}

const event = (id) => ({ id, category: 'academic', organizer: 'Robotics Club', title: id, startsAt: '2026-11-20T15:00:00Z' });

test('keys map to ksu-go.account.<id>.* and back', async () => {
  const device = deviceStorage();
  const noah = scopedStorage(device, 'user-demo-organizer');
  await noah.setItem('ksu-go.registered-event-ids', '["ev-04"]');
  assert.deepEqual([...device.values.keys()], ['ksu-go.account.user-demo-organizer.registered-event-ids']);
  assert.equal(await noah.getItem('ksu-go.registered-event-ids'), '["ev-04"]');
  assert.deepEqual(await noah.getAllKeys(), ['ksu-go.registered-event-ids']);
  await noah.removeItem('ksu-go.registered-event-ids');
  assert.equal(device.values.size, 0);
  assert.equal(accountPrefix(GUEST_ACCOUNT), 'ksu-go.account.guest.');
  assert.throws(() => noah.getItem('other.key'), /ksu-go\./);
});

test('dropping legacy registration ids only clears the current account’s old record', async () => {
  const device = deviceStorage({
    'ksu-go.account.maya.registered-event-ids': '["ev-01"]',
    'ksu-go.account.noah.registered-event-ids': '["ev-04"]',
    'ksu-go.account.maya.weekly-event-choices': '[]',
    'ksu-go.account.maya.interests': '["arts"]',
    'ksu-go.server-url': 'http://server.test',
  });
  await discardLegacyRegistrations(scopedStorage(device, 'maya'));
  assert.equal(device.values.has('ksu-go.account.maya.registered-event-ids'), false);
  assert.equal(device.values.get('ksu-go.account.noah.registered-event-ids'), '["ev-04"]');
  assert.equal(device.values.get('ksu-go.account.maya.weekly-event-choices'), '[]');
  assert.equal(device.values.get('ksu-go.account.maya.interests'), '["arts"]');
  assert.equal(device.values.get('ksu-go.server-url'), 'http://server.test');
});

test('accounts never see each other’s registrations, choices or uploads; the server address stays device-wide', async () => {
  const device = deviceStorage({ 'ksu-go.registered-event-ids': '["old-device-wide"]' });
  const maya = scopedStorage(device, 'user-demo-student');
  const noah = scopedStorage(device, 'user-demo-organizer');
  const guest = scopedStorage(device, GUEST_ACCOUNT);

  await saveRegisteredEventIds(maya, ['ev-01']);
  await saveRegisteredEventIds(noah, ['ev-04', 'ev-10']);
  await saveServerUrlOverride(device, 'http://server.test');
  assert.deepEqual(await loadRegisteredEventIds(maya), ['ev-01']);
  assert.deepEqual(await loadRegisteredEventIds(noah), ['ev-04', 'ev-10']);
  // Pre-account data is ignored: each account starts fresh.
  assert.deepEqual(await loadRegisteredEventIds(guest), []);

  const mayaChoices = new WeekChoices(maya);
  await mayaChoices.choose(event('ev-02'), 'save');
  const guestChoices = new WeekChoices(guest);
  await guestChoices.load();
  assert.deepEqual(guestChoices.snapshot(), []);
  await guestChoices.choose(event('ev-03'), 'skip');
  const mayaAgain = new WeekChoices(maya);
  await mayaAgain.load();
  assert.deepEqual(mayaAgain.snapshot().map((choice) => choice.id), ['ev-02']);

  assert.equal(device.values.get('ksu-go.server-url'), 'http://server.test');
  assert.deepEqual(await maya.getAllKeys(), ['ksu-go.registered-event-ids', 'ksu-go.weekly-event-choices']);
});

test('OrganizerSession, given scoped storage through its constructor, lists only its own account’s uploads', async () => {
  const device = deviceStorage({
    'ksu-go.uploaded-route.route-device-wide': '1',
    'ksu-go.account.user-other-organizer.uploaded-route.route-other': '1',
  });
  const noah = scopedStorage(device, 'user-demo-organizer');
  const read = [];
  const api = {
    getRoute: async (id) => { read.push(id); return { id, status: 'draft', createdAt: '2026-11-19T12:00:00Z' }; },
    uploadRoute: async () => ({ id: 'route-new', status: 'processing', createdAt: '2026-11-19T12:00:00Z' }),
  };
  const session = new OrganizerSession(api, noah, []);
  await session.upload({ video: { uri: 'file:///a.mov', name: 'a.mov', type: 'video/quicktime' },
    buildingId: 'b-mathematics', destination: 'Room 204', startFloor: '1', destinationFloor: '2' });
  assert.equal(device.values.get('ksu-go.account.user-demo-organizer.uploaded-route.route-new'), '1');

  const reopened = new OrganizerSession(api, noah, []);
  await reopened.refresh();
  assert.deepEqual(Object.keys(reopened.state.routes), ['route-new']);
  assert.equal(read.includes('route-other'), false);
  assert.equal(read.includes('route-device-wide'), false);
});

test('Reset demo still clears every account’s scoped keys and the session', async () => {
  const device = deviceStorage({ 'expo.keep': 'x', 'ksu-go.session': '{}' });
  const demo = new DemoStorage(device);
  await scopedStorage(demo, 'user-demo-student').setItem('ksu-go.weekly-event-choices', '[]');
  await scopedStorage(demo, GUEST_ACCOUNT).setItem('ksu-go.weekly-event-choices', '[]');
  await demo.reset();
  assert.deepEqual([...device.values.keys()], ['expo.keep']);
});
