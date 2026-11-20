import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiRequestError } from '../api/client.ts';
import { DemoStorage } from '../settings/demoStorage.ts';
import { scopedStorage } from '../settings/scopedStorage.ts';
import { AuthController, AuthFormError, NO_SERVER, SESSION_ENDED, SESSION_KEY, UNREACHABLE } from './controller.ts';

const maya = { id: 'user-demo-student', name: 'Maya Chen', email: 'student@ksu-go.example', profile: { major: null, classYear: null, bio: null, avatarColor: 'gold' }, ownedOrganizationIds: [], followingOrganizationIds: [] };
const noah = { id: 'user-demo-organizer', name: 'Noah Brooks', email: 'organizer@ksu-go.example', profile: { major: null, classYear: null, bio: null, avatarColor: 'gold' }, ownedOrganizationIds: ['org-robotics-club'], followingOrganizationIds: [] };

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

const unauthorized = () => new ApiRequestError(401, 'unauthenticated', 'Sign in to do this.');

function setup({ initial = {}, server = 'http://server.test', api = {} } = {}) {
  const storage = deviceStorage(initial);
  const calls = [];
  const clients = [];
  const controller = new AuthController({
    storage,
    serverUrl: () => server,
    clientFactory: (url, auth) => {
      const client = {
        login: async (body) => { calls.push(['login', body]); return api.login ? api.login(body) : { token: 'tok-noah', user: noah }; },
        signup: async (body) => { calls.push(['signup', body]); return api.signup ? api.signup(body) : { token: 'tok-new', user: { ...maya, id: 'user-new' } }; },
        logout: async () => { calls.push(['logout', auth?.token()]); if (api.logout) return api.logout(); },
        me: async () => { calls.push(['me', auth?.token()]); return api.me ? api.me(auth?.token()) : maya; },
      };
      clients.push({ url, auth });
      return client;
    },
    meTimeoutMs: 30,
    signInTimeoutMs: 30,
  });
  return { controller, storage, calls, clients };
}

const saved = (user, token) => ({ [SESSION_KEY]: JSON.stringify({ token, user }) });

test('a phase C session retains its token but drops old role claims until /me verifies ownership', async () => {
  const old = { id: noah.id, name: noah.name, email: noah.email, role: 'organizer', organizationId: 'org-robotics-club' };
  const { controller } = setup({ initial: saved(old, 'old-token'), api: { me: () => noah } });
  await controller.restore();
  assert.equal(controller.token(), 'old-token');
  assert.equal(controller.state.verified, false);
  assert.deepEqual(controller.state.user.ownedOrganizationIds, []);
  assert.deepEqual(controller.state.user.followingOrganizationIds, []);
  assert.deepEqual(controller.state.user.profile, { major: null, classYear: null, bio: null, avatarColor: 'gold' });
  assert.equal('role' in controller.state.user, false);
  await controller.recheck();
  assert.equal(controller.state.verified, true);
  assert.deepEqual(controller.state.user, noah);
});

test('fresh server users update ownership and profile without replacing the session', async () => {
  const { controller, storage } = setup({ initial: saved(maya, 'maya-token') });
  await controller.restore();
  await controller.recheck();
  const updated = { ...maya, ownedOrganizationIds: ['org-new'], followingOrganizationIds: ['org-robotics-club'],
    profile: { major: 'Computer Science', classYear: 2028, bio: 'Building things.', avatarColor: 'ink' } };
  await controller.setUser(updated);
  assert.equal(controller.token(), 'maya-token');
  assert.deepEqual(controller.state.user, updated);
  assert.deepEqual(JSON.parse(storage.values.get(SESSION_KEY)).user, updated);
  await controller.setUser(noah);
  assert.deepEqual(controller.state.user, updated);
});

test('restore with nothing saved goes to sign-in', async () => {
  const { controller } = setup();
  assert.deepEqual(controller.state, { status: 'restoring' });
  await controller.restore();
  assert.deepEqual(controller.state, { status: 'signedOut', message: null });
});

test('restore keeps a saved session read-only until /me confirms it', async () => {
  const { controller, calls, storage } = setup({ initial: saved(maya, 'tok-maya'), api: { me: () => ({ ...maya, name: 'Maya C.' }) } });
  await controller.restore();
  assert.deepEqual(controller.state, { status: 'signedIn', token: 'tok-maya', user: maya, verified: false });
  assert.deepEqual(calls, []);
  await controller.recheck();
  assert.deepEqual(calls, [['me', 'tok-maya']]);
  assert.equal(controller.state.verified, true);
  assert.equal(controller.state.user.name, 'Maya C.');
  assert.equal(JSON.parse(storage.values.get(SESSION_KEY)).user.name, 'Maya C.');
});

test('a recheck that confirms an already verified session changes nothing', async () => {
  const { controller, storage, calls } = setup({ api: { me: () => ({ ...noah }) } });
  await controller.restore();
  await controller.signIn('organizer@ksu-go.example', 'OrganizerDemo!26');
  const before = controller.state;
  const savedBefore = storage.values.get(SESSION_KEY);
  const seen = [];
  controller.subscribe((state) => seen.push(state));
  await controller.recheck();
  assert.deepEqual(calls.map(([name]) => name), ['login', 'me']);
  assert.deepEqual(seen, []);
  assert.equal(controller.state, before);
  assert.equal(storage.values.get(SESSION_KEY), savedBefore);
});

test('offline restore: an unreachable server keeps the session, read-only, and a later recheck verifies it', async () => {
  let online = false;
  const { controller } = setup({
    initial: saved(maya, 'tok-maya'),
    api: { me: () => { if (!online) throw new TypeError('Network request failed'); return maya; } },
  });
  await controller.restore();
  await controller.recheck();
  assert.deepEqual(controller.state, { status: 'signedIn', token: 'tok-maya', user: maya, verified: false });
  online = true;
  await controller.recheck();
  assert.equal(controller.state.verified, true);
});

test('a hanging /me times out and stays read-only', async () => {
  const { controller } = setup({ initial: saved(maya, 'tok-maya'), api: { me: () => new Promise(() => {}) } });
  await controller.restore();
  await controller.recheck();
  assert.equal(controller.state.status, 'signedIn');
  assert.equal(controller.state.verified, false);
});

test('restore with an expired token signs out with the session-ended message and clears only the session', async () => {
  const { controller, storage } = setup({
    initial: { ...saved(maya, 'tok-old'), 'ksu-go.server-url': 'http://server.test', 'ksu-go.account.user-demo-student.registered-event-ids': '["ev-04"]' },
    api: { me: () => { throw unauthorized(); } },
  });
  await controller.restore();
  await controller.recheck();
  assert.deepEqual(controller.state, { status: 'signedOut', message: SESSION_ENDED });
  assert.equal(storage.values.has(SESSION_KEY), false);
  assert.equal(storage.values.get('ksu-go.server-url'), 'http://server.test');
  assert.equal(storage.values.get('ksu-go.account.user-demo-student.registered-event-ids'), '["ev-04"]');
});

test('a corrupt saved session is treated as none', async () => {
  for (const raw of ['{bad', '{"token":1}', JSON.stringify({ token: 't', user: { ...maya, name: 42 } })]) {
    const { controller } = setup({ initial: { [SESSION_KEY]: raw } });
    await controller.restore();
    assert.deepEqual(controller.state, { status: 'signedOut', message: null }, raw);
  }
});

test('sign in saves the session and is verified at once', async () => {
  const { controller, storage, calls } = setup();
  await controller.restore();
  await controller.signIn('organizer@ksu-go.example', 'OrganizerDemo!26');
  assert.deepEqual(calls, [['login', { email: 'organizer@ksu-go.example', password: 'OrganizerDemo!26' }]]);
  assert.deepEqual(controller.state, { status: 'signedIn', token: 'tok-noah', user: noah, verified: true });
  assert.deepEqual(JSON.parse(storage.values.get(SESSION_KEY)), { token: 'tok-noah', user: noah });
  assert.equal(controller.token(), 'tok-noah');
});

test('sign-in and sign-up show the server message, or say the server is needed', async () => {
  const wrong = setup({ api: { login: () => { throw new ApiRequestError(401, 'unauthenticated', 'Email or password is wrong.'); } } });
  await wrong.controller.restore();
  await assert.rejects(wrong.controller.signIn('a@b.c', 'nope'), (error) => error instanceof AuthFormError && error.message === 'Email or password is wrong.');
  assert.equal(wrong.controller.state.status, 'signedOut');

  const taken = setup({ api: { signup: () => { throw new ApiRequestError(422, 'invalid_request', 'An account with this email already exists.'); } } });
  await taken.controller.restore();
  await assert.rejects(taken.controller.signUp('Ana', 'student@ksu-go.example', 'long enough'),
    (error) => error.message === 'An account with this email already exists.');

  const down = setup({ api: { login: () => { throw new TypeError('Network request failed'); } } });
  await down.controller.restore();
  await assert.rejects(down.controller.signIn('a@b.c', 'pw'), (error) => error.message === UNREACHABLE);

  const none = setup({ server: null });
  await none.controller.restore();
  await assert.rejects(none.controller.signIn('a@b.c', 'pw'), (error) => error.message === NO_SERVER);
});

test('sign up arrives signed in without organization ownership', async () => {
  const { controller, calls } = setup();
  await controller.restore();
  await controller.signUp('Ana Ruiz', 'ana@example.com', 'correct horse');
  assert.deepEqual(calls[0], ['signup', { name: 'Ana Ruiz', email: 'ana@example.com', password: 'correct horse' }]);
  assert.deepEqual(controller.state.user.ownedOrganizationIds, []);
  assert.equal('role' in controller.state.user, false);
});

test('logout clears only the session, keeps server address and every account’s data, and never resets the demo', async () => {
  const device = deviceStorage({
    ...saved(noah, 'tok-noah'),
    'ksu-go.server-url': 'http://server.test',
    'ksu-go.account.user-demo-organizer.uploaded-route.route-1': '1',
    'ksu-go.account.user-demo-student.weekly-event-choices': '[]',
  });
  const demo = new DemoStorage(device);
  let resets = 0;
  demo.reset = () => { resets += 1; return Promise.resolve(); };
  const controller = new AuthController({
    storage: demo, serverUrl: () => 'http://server.test',
    clientFactory: (_url, auth) => ({ logout: async () => { throw unauthorized(); }, me: async () => noah, login: async () => null, signup: async () => null, auth }),
  });
  await controller.restore();
  await controller.signOut();
  assert.deepEqual(controller.state, { status: 'signedOut', message: null }); // a 401 from logout is not "session ended"
  assert.equal(resets, 0);
  assert.deepEqual([...device.values.keys()].sort(), [
    'ksu-go.account.user-demo-organizer.uploaded-route.route-1',
    'ksu-go.account.user-demo-student.weekly-event-choices',
    'ksu-go.server-url',
  ]);
});

test('logout offline still signs out locally', async () => {
  const { controller, storage } = setup({ initial: saved(maya, 'tok-maya'), api: { logout: () => { throw new TypeError('offline'); } } });
  await controller.restore();
  await controller.signOut();
  assert.equal(controller.state.status, 'signedOut');
  assert.equal(storage.values.has(SESSION_KEY), false);
});

test('a 401 for the current token ends the session once; a stale token from another account does nothing', async () => {
  const { controller } = setup();
  await controller.restore();
  await controller.signIn('organizer@ksu-go.example', 'pw');
  const seen = [];
  controller.subscribe((state) => seen.push(state.status));
  controller.apiAuth.onUnauthorized('tok-someone-else');
  assert.equal(controller.state.status, 'signedIn');
  controller.apiAuth.onUnauthorized('tok-noah');
  controller.apiAuth.onUnauthorized('tok-noah');
  assert.deepEqual(controller.state, { status: 'signedOut', message: SESSION_ENDED });
  assert.deepEqual(seen, ['signedOut']);
  assert.equal(controller.token(), null);
});

test('a late /me answer cannot overwrite a newer sign-out', async () => {
  let answer;
  const { controller } = setup({ initial: saved(maya, 'tok-maya'), api: { me: () => new Promise((resolve) => { answer = resolve; }) } });
  await controller.restore();
  const checking = controller.recheck();
  await controller.signOut();
  answer(maya);
  await checking;
  assert.deepEqual(controller.state, { status: 'signedOut', message: null });
});

test('guest mode: browse offline from sign-in, sign in from guest', async () => {
  const { controller } = setup();
  await controller.restore();
  controller.browseOffline();
  assert.deepEqual(controller.state, { status: 'guest' });
  assert.equal(controller.token(), null);
  controller.leaveGuest();
  assert.deepEqual(controller.state, { status: 'signedOut', message: null });
});

test('account data written through scoped storage survives sign out and the next sign in', async () => {
  const device = deviceStorage();
  const { controller } = setup();
  await controller.restore();
  await controller.signIn('organizer@ksu-go.example', 'pw');
  await scopedStorage(device, controller.state.user.id).setItem('ksu-go.registered-event-ids', '["ev-04"]');
  await controller.signOut();
  await controller.signIn('organizer@ksu-go.example', 'pw');
  assert.equal(await scopedStorage(device, controller.state.user.id).getItem('ksu-go.registered-event-ids'), '["ev-04"]');
});
