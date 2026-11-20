import assert from 'node:assert/strict';
import test from 'node:test';

import { loadRegisteredEventIds, loadServerUrlOverride, resolveServerUrl, saveRegisteredEventIds, saveServerUrlOverride } from '../settings/storage.ts';
import { AppDataController } from './controller.ts';
import { WeekChoices } from '../week/choices.ts';
import { DemoStorage } from '../settings/demoStorage.ts';
import { ApiRequestError } from '../api/client.ts';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
}

function makeController(overrides = {}) {
  let savedOverride = null;
  let poll;
  let interval;
  const options = {
    defaultApiUrl: 'http://default.test',
    loadServerUrlOverride: async () => savedOverride,
    saveServerUrlOverride: async (url) => { savedOverride = url; },
    fixtureEvents: () => [{ id: 'fixture' }],
    fixtureRoute: () => null,
    clientFactory: () => ({ health: async () => ({ ok: true, pipelineMode: 'mock' }), listEvents: async () => [{ id: 'server' }], getRoute: async () => ({ id: 'route-server' }) }),
    schedulePoll: (callback, delay) => { poll = callback; interval = delay; return 1; },
    cancelPoll: () => {},
    now: () => new Date('2026-11-17T12:00:00.000Z'),
    ...overrides,
  };
  return {
    controller: new AppDataController(options),
    getPoll: () => poll,
    getInterval: () => interval,
    getSavedOverride: () => savedOverride,
  };
}

// The device id is gone: registering is per signed-in user (CONTRACTS.md section 5).
test('blank URL overrides fall back to EXPO_PUBLIC_API_URL', async () => {
  const storage = memoryStorage();
  await saveServerUrlOverride(storage, ' https://server.test/ ');
  assert.equal(await loadServerUrlOverride(storage), 'https://server.test/');
  await saveServerUrlOverride(storage, '  ');
  assert.equal(await loadServerUrlOverride(storage), null);
  assert.equal(resolveServerUrl(await loadServerUrlOverride(storage), 'https://default.test/'), 'https://default.test/');
});

test('persists registered event ids and ignores malformed storage values', async () => {
  const storage = memoryStorage();
  await saveRegisteredEventIds(storage, ['event-1', 'event-2']);
  assert.deepEqual(await loadRegisteredEventIds(storage), ['event-1', 'event-2']);

  await storage.setItem('ksu-go.registered-event-ids', '{bad json');
  assert.deepEqual(await loadRegisteredEventIds(storage), []);
});

test('uses fixtures immediately when no server URL is configured', async () => {
  const { controller } = makeController({ defaultApiUrl: '', loadServerUrlOverride: async () => null });
  await controller.start();
  assert.equal(controller.state.source, 'fixtures');
  assert.equal(controller.state.offline, true);
  assert.deepEqual(controller.state.events, [{ id: 'fixture' }]);
  controller.stop();
});

test('falls back when health does not answer before the timeout', async () => {
  const { controller } = makeController({
    healthTimeoutMs: 5,
    clientFactory: () => ({ health: () => new Promise(() => {}), listEvents: async () => [], getRoute: async () => null }),
  });
  await controller.start();
  assert.equal(controller.state.source, 'fixtures');
  controller.stop();
});

test('falls back when the events request hangs after a healthy response', async () => {
  let eventsSignal;
  const { controller } = makeController({
    eventsTimeoutMs: 5,
    clientFactory: () => ({
      health: async () => ({ ok: true, pipelineMode: 'mock' }),
      listEvents: (_range, signal) => {
        eventsSignal = signal;
        return new Promise(() => {});
      },
      getRoute: async () => null,
    }),
  });

  const started = await Promise.race([
    controller.start().then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 50)),
  ]);
  controller.stop();

  assert.equal(started, true, 'startup should finish after the events timeout');
  assert.equal(controller.state.source, 'fixtures');
  assert.equal(eventsSignal?.aborted, true);
});

test('polls every ten seconds and switches back to server data when health recovers', async () => {
  let healthy = false;
  let requestedRange;
  const { controller, getPoll, getInterval } = makeController({
    clientFactory: () => ({
      health: async () => { if (!healthy) throw new Error('offline'); return { ok: true, pipelineMode: 'mock' }; },
      listEvents: async range => { requestedRange = range; return [{ id: 'server' }]; },
      getRoute: async () => ({ id: 'route-server' }),
    }),
  });

  await controller.start();
  assert.equal(controller.state.source, 'fixtures');
  assert.equal(getInterval(), 10_000);
  healthy = true;
  await getPoll()();
  assert.equal(controller.state.source, 'server');
  assert.equal(controller.state.offline, false);
  assert.equal(requestedRange, 'week');
  assert.deepEqual(controller.state.events, [{ id: 'server' }]);
  controller.stop();
});

test('changing the server URL refreshes immediately and later polls use the new URL', async () => {
  let overrideHealthy = false;
  const { controller, getPoll, getSavedOverride } = makeController({
    clientFactory: (url) => ({
      health: async () => {
        if (url === 'http://override.test/' && !overrideHealthy) throw new Error('offline');
        return { ok: true, pipelineMode: 'mock' };
      },
      listEvents: async () => [{ id: url }],
      getRoute: async () => ({ id: url }),
    }),
  });
  await controller.start();
  await controller.setServerUrl(' http://override.test/ ');
  assert.equal(getSavedOverride(), 'http://override.test/');
  assert.equal(controller.state.serverUrl, 'http://override.test/');
  assert.equal(controller.state.source, 'fixtures');

  overrideHealthy = true;
  await getPoll()();
  assert.equal(controller.state.source, 'server');
  assert.deepEqual(controller.state.events, [{ id: 'http://override.test/' }]);
  controller.stop();
});

test('a stalled route request aborts at its configured deadline and returns the fixture route', async (t) => {
  const fixture = { id: 'route-fixture' };
  let signal;
  let finishRequest;
  const { controller } = makeController({
    routeTimeoutMs: 25,
    fixtureRoute: (id) => id === fixture.id ? fixture : null,
    clientFactory: () => ({
      health: async () => ({ ok: true, pipelineMode: 'mock' }),
      listEvents: async () => [{ id: 'server' }],
      getRoute: (_id, requestSignal) => {
        signal = requestSignal;
        return new Promise((resolve) => { finishRequest = resolve; });
      },
    }),
  });
  t.after(() => controller.stop());
  await controller.start();
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const pending = controller.getRoute(fixture.id);
  t.mock.timers.tick(24);
  assert.equal(signal.aborted, false);
  assert.equal(controller.state.source, 'server');
  t.mock.timers.tick(1);
  assert.equal(await pending, fixture);
  assert.equal(signal.aborted, true);
  assert.equal(controller.state.offline, true);
  assert.deepEqual(controller.state.events, [{ id: 'fixture' }]);

  finishRequest({ id: 'late-server-route' });
  await Promise.resolve();
  assert.equal(controller.state.source, 'fixtures');
});

// Registration errors are covered in src/account/register.test.mjs.
test('route API errors are rethrown without switching to fixtures', async (t) => {
  const error = new ApiRequestError(404, 'not_found', 'Not found.');
  const { controller } = makeController({
    clientFactory: () => ({
      health: async () => ({ ok: true, pipelineMode: 'mock' }),
      listEvents: async () => [{ id: 'server' }],
      getRoute: async () => { throw error; },
    }),
  });
  t.after(() => controller.stop());
  await controller.start();

  await assert.rejects(controller.getRoute('missing'), (caught) => caught === error);
  assert.equal(controller.state.source, 'server');
});

test('a server registration count replaces the shown count, and markOffline falls back to fixtures', async (t) => {
  const { controller } = makeController({
    fixtureEvents: () => [{ id: 'event-1', registeredCount: 4 }],
    clientFactory: () => ({
      health: async () => ({ ok: true, pipelineMode: 'mock' }),
      listEvents: async () => [{ id: 'event-1', registeredCount: 20 }],
      getRoute: async () => null,
    }),
  });
  t.after(() => controller.stop());
  await controller.start();

  controller.setRegisteredCount('event-1', 21);
  controller.setRegisteredCount('missing', 99);
  assert.deepEqual(controller.state.events, [{ id: 'event-1', registeredCount: 21 }]);
  controller.markOffline();
  assert.equal(controller.state.source, 'fixtures');
  assert.deepEqual(controller.state.events, [{ id: 'event-1', registeredCount: 4 }]);
});

test('weekly choices serialize, survive restart, and reset independently of registration', async () => {
  const storage = memoryStorage();
  await saveRegisteredEventIds(storage, ['a']);
  const first = new WeekChoices(storage);
  const event = { id: 'a', title: 'Studio', startsAt: '2026-11-20T10:00:00Z', organizer: 'Arts', category: 'arts' };
  await Promise.all([first.choose(event, 'save'), first.choose(event, 'skip'), first.choose({ ...event, id: 'b' }, 'skip')]);
  const restarted = new WeekChoices(storage);
  await restarted.load();
  assert.deepEqual(restarted.snapshot(), first.snapshot());
  assert.deepEqual(restarted.snapshot().map(vote => vote.id), ['a', 'b']);
  assert.equal(restarted.snapshot()[0].saved.title, 'Studio');
  await restarted.remove('a');
  assert.deepEqual(restarted.snapshot().map(vote => vote.id), ['b']);
  await restarted.reset();
  const fresh = new WeekChoices(storage);
  await fresh.load();
  assert.deepEqual(fresh.snapshot(), []);
  assert.deepEqual(await loadRegisteredEventIds(storage), ['a']);
});

test('a failed preference write leaves the card available for retry', async () => {
  const storage = memoryStorage();
  const store = new WeekChoices(storage);
  const event = { id: 'a', title: 'Studio', startsAt: '2026-11-20T10:00:00Z', organizer: 'Arts', category: 'arts' };
  const write = storage.setItem;
  storage.setItem = async () => { throw new Error('disk full'); };
  await assert.rejects(store.choose(event, 'save'), /disk full/);
  assert.deepEqual(store.snapshot(), []);
  storage.setItem = write;
  await store.choose(event, 'save');
  assert.equal(store.snapshot()[0].id, 'a');
});

test('saving from event details replaces a previous skip and persists one fresh saved entry', async () => {
  const storage = memoryStorage();
  const choices = new WeekChoices(storage);
  const event = { id: 'a', title: 'Build night', startsAt: '2026-11-20T10:00:00Z', organizer: 'Robotics Club', category: 'academic' };
  await choices.choose(event, 'skip');
  const updated = { ...event, title: 'New build night', startsAt: '2026-11-20T12:00:00Z' };
  await choices.setSaved(updated, true);
  await choices.setSaved(updated, true);
  const restored = new WeekChoices(storage);
  await restored.load();
  assert.equal(restored.snapshot().length, 1);
  assert.deepEqual(restored.snapshot()[0].saved, { title: updated.title, startsAt: updated.startsAt });
});

test('Save and swipe removal share the same record and survive reopening', async () => {
  const storage = memoryStorage();
  const choices = new WeekChoices(storage);
  const event = { id: 'a', title: 'Studio', startsAt: '2026-11-20T10:00:00Z', organizer: 'Arts', category: 'arts' };
  await choices.setSaved(event, true);
  await choices.remove(event.id);
  const restored = new WeekChoices(storage);
  await restored.load();
  assert.deepEqual(restored.snapshot(), []);
  await restored.setSaved(event, true);
  await restored.setSaved(event, false);
  await restored.setSaved(event, false);
  assert.deepEqual(restored.snapshot(), []);
});

test('a failed Save toggle keeps the prior choice and can be retried', async () => {
  const storage = memoryStorage();
  const choices = new WeekChoices(storage);
  const event = { id: 'a', title: 'Studio', startsAt: '2026-11-20T10:00:00Z', organizer: 'Arts', category: 'arts' };
  await choices.choose(event, 'skip');
  const write = storage.setItem;
  storage.setItem = async () => { throw new Error('disk full'); };
  await assert.rejects(choices.setSaved(event, true), /disk full/);
  assert.equal(choices.snapshot()[0].saved, null);
  storage.setItem = write;
  await choices.setSaved(event, true);
  const remove = storage.removeItem;
  storage.removeItem = async () => { throw new Error('disk full'); };
  await assert.rejects(choices.setSaved(event, false), /disk full/);
  assert.equal(choices.snapshot()[0].saved.title, event.title);
  storage.removeItem = remove;
  await choices.setSaved(event, false);
  assert.deepEqual(choices.snapshot(), []);
});

test('demo reset clears KSU-GO data, orders pending writes, and isolates the next session', async () => {
  const keys = new Map([['expo.preference', 'keep'], ['ksu-go.device-id', 'old'], ['ksu-go.organizer-mode', 'on']]);
  const backing = {
    getItem: async key => keys.get(key) ?? null,
    getAllKeys: async () => [...keys.keys()],
    setItem: async (key, value) => { keys.set(key, value); },
    removeItem: async key => { keys.delete(key); },
    multiRemove: async list => { list.forEach(key => keys.delete(key)); },
  };
  const old = new DemoStorage(backing);
  const pending = old.setItem('ksu-go.uploaded-route.r1', '1');
  const reset = old.reset();
  const late = old.setItem('ksu-go.registered-event-ids', '["event"]');
  await Promise.all([pending, reset, late]);
  assert.deepEqual([...keys.keys()], ['expo.preference']);
  const fresh = new DemoStorage(backing);
  await fresh.setItem('ksu-go.device-id', 'fresh');
  await old.removeItem('ksu-go.device-id');
  await old.reset();
  assert.equal(await fresh.getItem('ksu-go.device-id'), 'fresh');
  backing.multiRemove = async () => { throw new Error('disk'); };
  await assert.rejects(fresh.reset(), /disk/);
  await fresh.setItem('ksu-go.organizer-mode', 'on');
  assert.equal(await fresh.getItem('ksu-go.organizer-mode'), 'on');
});

test('a discarded demo session cannot start its poll after storage finishes loading', async () => {
  let resolveRead;
  const { controller, getPoll } = makeController({
    loadServerUrlOverride: () => new Promise(resolve => { resolveRead = resolve; }),
  });
  const starting = controller.start();
  controller.stop();
  resolveRead(null);
  await starting;
  assert.equal(getPoll(), undefined);
});
