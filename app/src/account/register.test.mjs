import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiRequestError, createApiClient } from '../api/client.ts';
import { NEEDS_SERVER, NEEDS_SIGN_IN, registerForEvent } from './register.ts';

const maya = { id: 'user-demo-student', name: 'Maya Chen', email: 'student@ksu-go.example', role: 'student', organizationId: null };
const signedIn = (verified = true) => ({ status: 'signedIn', token: 'tok-maya', user: maya, verified });

function run(overrides = {}) {
  const log = { counts: [], saved: [], offline: 0, calls: [] };
  const input = {
    eventId: 'ev-04',
    state: signedIn(),
    offline: false,
    registeredIds: [],
    api: { register: async (id, signal) => { log.calls.push({ id, signal }); return { registered: true, registeredCount: 13 }; } },
    onCount: (id, count) => log.counts.push([id, count]),
    markOffline: () => { log.offline += 1; },
    save: async (ids) => { log.saved.push(ids); },
    ...overrides,
  };
  return { log, result: registerForEvent(input) };
}

test('a signed-in user registers through the server and the record and count update', async () => {
  const { log, result } = run();
  assert.deepEqual(await result, ['ev-04']);
  assert.equal(log.calls.length, 1);
  assert.deepEqual(log.counts, [['ev-04', 13]]);
  assert.deepEqual(log.saved, [['ev-04']]);
});

test('the request carries the Bearer token and no body', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ registered: true, registeredCount: 13 }), { status: 200 });
  };
  const api = createApiClient('http://server.test', fetcher, undefined, undefined, { token: () => 'tok-maya', onUnauthorized: () => {} });
  const { result } = run({ api });
  await result;
  assert.equal(calls[0].url, 'http://server.test/api/events/ev-04/register');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(new Headers(calls[0].init.headers).get('authorization'), 'Bearer tok-maya');
  assert.equal(calls[0].init.body, undefined);
});

test('a guest is asked to sign in and nothing is sent', async () => {
  const { log, result } = run({ state: { status: 'guest' } });
  await assert.rejects(result, (error) => error.message === NEEDS_SIGN_IN);
  assert.equal(log.calls.length, 0);
});

test('offline, or a session not yet confirmed, says registering needs the server', async () => {
  for (const overrides of [{ offline: true }, { state: signedIn(false) }, { api: null }, { registeredIds: null }]) {
    const { log, result } = run(overrides);
    await assert.rejects(result, (error) => error.message === NEEDS_SERVER, JSON.stringify(Object.keys(overrides)));
    assert.equal(log.calls.length, 0);
    assert.deepEqual(log.saved, []);
  }
});

test('an already registered event is not sent again', async () => {
  const { log, result } = run({ registeredIds: ['ev-04'] });
  assert.deepEqual(await result, ['ev-04']);
  assert.equal(log.calls.length, 0);
});

test('an unreachable server falls back to fixtures and saves nothing', async () => {
  const { log, result } = run({ api: { register: async () => { throw new TypeError('Network request failed'); } } });
  await assert.rejects(result, (error) => error.message === NEEDS_SERVER);
  assert.equal(log.offline, 1);
  assert.deepEqual(log.saved, []);
  assert.deepEqual(log.counts, []);
});

test('a stalled registration aborts at its deadline and a late answer changes nothing', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  let finish;
  const { log, result } = run({
    timeoutMs: 25,
    api: { register: (_id, requestSignal) => { signal = requestSignal; return new Promise((resolve) => { finish = resolve; }); } },
  });
  t.mock.timers.tick(24);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  await assert.rejects(result, (error) => error.message === NEEDS_SERVER);
  assert.equal(signal.aborted, true);
  assert.equal(log.offline, 1);
  finish({ registered: true, registeredCount: 99 });
  await Promise.resolve();
  assert.deepEqual(log.counts, []);
});

test('a server error keeps its message and does not switch to fixtures', async () => {
  const { log, result } = run({ api: { register: async () => { throw new ApiRequestError(404, 'not_found', 'Event not found.'); } } });
  await assert.rejects(result, (error) => error.message === 'Event not found.');
  assert.equal(log.offline, 0);
});
