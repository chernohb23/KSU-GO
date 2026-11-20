import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiRequestError, createApiClient } from './client.ts';

const jsonFetcher = (result, calls) => async (input, init = {}) => {
  calls.push({ input: String(input), init });
  return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } });
};

test('organization, follow, profile, registration and event-management calls use the contract paths and bodies', async () => {
  const calls = [];
  const client = createApiClient('http://campus.example/', jsonFetcher({}, calls), undefined, undefined,
    { token: () => 'owner-token', onUnauthorized() {} });
  const profile = { name: 'Maya', major: null, classYear: 2028, bio: 'Hello', avatarColor: 'amber' };
  const org = { name: 'Chess', description: 'Play chess', logo: { initials: 'CH', color: 'gold' },
    memberCount: 12, meets: null, contactEmail: null, website: null };
  const fields = { title: 'Meetup', description: 'Build', category: 'academic', partnerOrganizationId: null, tags: [],
    startsAt: '2026-11-21T18:00:00-05:00', durationMin: 60, location: { buildingId: 'b-mathematics', room: '113' }, capacity: null };
  const signal = new AbortController().signal;
  await client.updateProfile(profile);
  await client.myRegistrations(signal);
  await client.listOrganizations(signal);
  await client.getOrganization('org/one', signal);
  await client.organizationEvents('org/one', 'past', signal);
  await client.createOrganization(org);
  await client.updateOrganization('org/one', org);
  await client.setFollowing('org/one', true);
  await client.setFollowing('org/one', false);
  await client.createEvent({ ...fields, organizationId: 'org/one' });
  await client.editEvent('ev/one', fields);
  await client.cancelEvent('ev/one');
  await client.eventRegistrations('ev/one', signal);
  await client.eventDirections('ev/one', signal);
  assert.deepEqual(calls.map(({ input, init }) => [input.replace('http://campus.example/api', ''), init.method ?? 'GET']), [
    ['/me/profile', 'PUT'], ['/me/registrations', 'GET'], ['/organizations', 'GET'], ['/organizations/org%2Fone', 'GET'],
    ['/organizations/org%2Fone/events?when=past', 'GET'], ['/organizations', 'POST'], ['/organizations/org%2Fone', 'PUT'],
    ['/organizations/org%2Fone/follow', 'POST'], ['/organizations/org%2Fone/follow', 'DELETE'],
    ['/events', 'POST'], ['/events/ev%2Fone', 'PUT'], ['/events/ev%2Fone/cancel', 'POST'],
    ['/events/ev%2Fone/registrations', 'GET'], ['/events/ev%2Fone/directions', 'GET'],
  ]);
  for (const { init } of calls) assert.equal(new Headers(init.headers).get('authorization'), 'Bearer owner-token');
  for (const index of [1, 2, 3, 4, 12, 13]) assert.equal(calls[index].init.signal, signal);
  for (const [index, body] of [[0, profile], [5, org], [6, org], [9, { ...fields, organizationId: 'org/one' }], [10, fields]]) {
    assert.deepEqual(JSON.parse(calls[index].init.body), body);
    assert.equal(new Headers(calls[index].init.headers).get('content-type'), 'application/json');
  }
  for (const index of [7, 8, 11]) assert.equal(calls[index].init.body, undefined);
});

test('an upload needs an event before creating multipart data or opening the network', async () => {
  const unexpected = () => { throw new Error('Unexpected transport'); };
  const client = createApiClient('http://campus.example', unexpected, unexpected, unexpected);
  await assert.rejects(client.uploadRoute({ video: {}, startFloor: '1', destinationFloor: '1' }), /Choose the event/);
});

test('ownership and directions conflicts preserve their codes without expiring the session', async () => {
  for (const [status, code] of [[403, 'forbidden'], [409, 'room_has_route'], [409, 'event_cancelled']]) {
    let expired = false;
    const client = createApiClient('http://campus.example',
      async () => new Response(JSON.stringify({ error: { code, message: 'Server field message.' } }), { status }),
      undefined, undefined, { token: () => 'owner-token', onUnauthorized: () => { expired = true; } });
    await assert.rejects(client.editEvent('ev/one', {}), (error) =>
      error instanceof ApiRequestError && error.status === status && error.code === code && error.message === 'Server field message.');
    assert.equal(expired, false);
  }
});

test('uses the contract method, path, query, and JSON body for event and route endpoints', async () => {
  const calls = [];
  const client = createApiClient('https://campus.example/', jsonFetcher({ ok: true, pipelineMode: 'mock' }, calls));

  await client.health();
  await client.listEvents('week');
  await client.getEvent('event/one');
  await client.register('event/one');
  await client.getRoute('route/one');
  await client.updateRouteSteps('route/one', []);
  await client.confirmRoute('route/one');

  assert.deepEqual(calls.map(({ input, init }) => [input, init.method ?? 'GET']), [
    ['https://campus.example/api/health', 'GET'],
    ['https://campus.example/api/events?range=week', 'GET'],
    ['https://campus.example/api/events/event%2Fone', 'GET'],
    ['https://campus.example/api/events/event%2Fone/register', 'POST'],
    ['https://campus.example/api/routes/route%2Fone', 'GET'],
    ['https://campus.example/api/routes/route%2Fone/steps', 'PUT'],
    ['https://campus.example/api/routes/route%2Fone/confirm', 'POST'],
  ]);
  assert.equal(calls[3].init.body, undefined); // registering is per signed-in user, with no body
  assert.deepEqual(JSON.parse(calls[5].init.body), { steps: [] });
  assert.equal(calls[6].init.body, undefined);
});

test('sends route upload fields as multipart form data without forcing a content type', async () => {
  const calls = [];
  const form = { entries: [], append(name, value) { this.entries.push([name, value]); } };
  const client = createApiClient('http://campus.example', jsonFetcher({ id: 'route-new' }, calls), () => form);

  await client.uploadRoute({
    video: { uri: 'file:///room.mp4', name: 'room.mp4', type: 'video/mp4' },
    buildingId: 'b-engineering',
    destination: 'Room 204',
    startFloor: '1',
    destinationFloor: '2',
    eventId: 'event-1',
  });

  assert.equal(calls[0].input, 'http://campus.example/api/routes?eventId=event-1');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, form);
  assert.equal(calls[0].init.headers, undefined);
  assert.deepEqual(form.entries.map(([name]) => name), ['video', 'startFloor', 'destinationFloor']);
  assert.deepEqual(form.entries[0][1], { uri: 'file:///room.mp4', name: 'room.mp4', type: 'video/mp4' });
});

test('preserves the contract error code, message, and HTTP status', async () => {
  const fetcher = async () => new Response(JSON.stringify({ error: { code: 'route_has_failed_checks', message: 'Fix the failed checks before confirming.' } }), { status: 409 });
  const client = createApiClient('http://campus.example', fetcher);

  await assert.rejects(client.confirmRoute('route-1'), (error) => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'route_has_failed_checks');
    assert.equal(error.message, 'Fix the failed checks before confirming.');
    return true;
  });
});

test('passes cancellation signals to route and registration requests', async () => {
  const calls = [];
  const client = createApiClient('http://campus.example', jsonFetcher({}, calls));
  const controller = new AbortController();

  await client.getRoute('route-1', controller.signal);
  await client.register('event-1', controller.signal);

  assert.equal(calls[0].init.signal, controller.signal);
  assert.equal(calls[1].init.signal, controller.signal);
  assert.equal(calls[1].init.body, undefined);
});

test('sends actual byte progress and preserves server errors on the multipart transport', async () => {
  const form = { append() {} };
  const requests = [];
  const createXHR = () => {
    const request = { upload: {}, open(method, url) { this.method = method; this.url = url; }, send(body) { this.body = body; } };
    requests.push(request);
    return request;
  };
  const client = createApiClient('http://campus.example/', () => { throw Error('Unexpected fetch'); }, () => form, createXHR);
  const video = { uri: 'file:///clip.mov', name: 'clip.mov', type: 'video/quicktime' };
  const input = { video, eventId: 'ev-04', buildingId: 'building', destination: 'Room 204', startFloor: '1', destinationFloor: '2' };
  const progress = [];
  const first = client.uploadRoute(input, (pct) => progress.push(pct));
  const xhr = requests[0];
  assert.equal(xhr.method, 'POST');
  assert.equal(xhr.url, 'http://campus.example/api/routes?eventId=ev-04');
  assert.equal(xhr.body, form);
  xhr.upload.onprogress({ lengthComputable: true, loaded: 40, total: 100 });
  assert.deepEqual(progress, [40]);
  xhr.status = 202;
  xhr.responseText = '{"id":"route-new","status":"processing"}';
  xhr.onload();
  assert.equal((await first).id, 'route-new');
  const second = client.uploadRoute(input, () => {});
  requests[1].status = 402;
  requests[1].responseText = '{"error":{"code":"budget_exceeded","message":"Budget reached."}}';
  requests[1].onload();
  await assert.rejects(second, (error) => error instanceof ApiRequestError && error.code === 'budget_exceeded');
  const interrupted = client.uploadRoute(input, () => {});
  requests[2].onerror();
  await assert.rejects(interrupted, /network|connection/i);
});

test('an active upload can keep going, but a stalled transfer or response releases Retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false;
  const xhr = { upload: {}, open() {}, send() {}, abort() { aborted = true; this.onabort(); } };
  const client = createApiClient('http://campus.example', fetch, () => ({ append() {} }), () => xhr);
  const upload = client.uploadRoute({ video: {}, eventId: 'ev-04', buildingId: '', destination: '', startFloor: '1', destinationFloor: '1' }, () => {});
  const rejected = assert.rejects(upload, /connection/i);
  t.mock.timers.tick(80_000);
  xhr.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
  t.mock.timers.tick(80_000);
  assert.equal(aborted, false);
  t.mock.timers.tick(10_001);
  assert.equal(aborted, true);
  await rejected;
});

test('adds Authorization: Bearer to every request when a token exists, and nothing without one', async () => {
  const calls = [];
  let token = 'tok-noah';
  const client = createApiClient('http://campus.example', jsonFetcher({ ok: true }, calls), undefined, undefined, {
    token: () => token, onUnauthorized: () => {},
  });
  await client.me();
  await client.register('ev-04');
  await client.updateRouteSteps('route-1', []);
  assert.deepEqual(calls.map(({ init }) => new Headers(init.headers).get('authorization')), [
    'Bearer tok-noah', 'Bearer tok-noah', 'Bearer tok-noah',
  ]);
  assert.equal(new Headers(calls[2].init.headers).get('content-type'), 'application/json');
  token = null;
  await client.listEvents('week');
  assert.equal(calls[3].init.headers, undefined);
});

test('a 401 on a request that carried a token reports that token; a login 401 without one does not', async () => {
  const expired = [];
  const fetcher = async () => new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'Sign in to do this.' } }), { status: 401 });
  let token = 'tok-old';
  const client = createApiClient('http://campus.example', fetcher, undefined, undefined, {
    token: () => token, onUnauthorized: (sent) => expired.push(sent),
  });
  await assert.rejects(client.me(), (error) => error instanceof ApiRequestError && error.code === 'unauthenticated');
  assert.deepEqual(expired, ['tok-old']);
  token = null;
  await assert.rejects(client.login({ email: 'a@b.c', password: 'wrong' }), (error) => error.status === 401);
  assert.deepEqual(expired, ['tok-old']);
  const forbidden = createApiClient('http://campus.example',
    async () => new Response(JSON.stringify({ error: { code: 'forbidden', message: "Your account can't do this." } }), { status: 403 }),
    undefined, undefined, { token: () => 'tok', onUnauthorized: (sent) => expired.push(sent) });
  await assert.rejects(forbidden.confirmRoute('r'), (error) => error.code === 'forbidden');
  assert.deepEqual(expired, ['tok-old']);
});

test('the auth endpoints use the contract paths and bodies; logout accepts 204', async () => {
  const calls = [];
  const fetcher = async (input, init = {}) => {
    calls.push({ input: String(input), init });
    if (String(input).endsWith('/logout')) return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ token: 't', user: {} }), { status: 200 });
  };
  const client = createApiClient('http://campus.example/', fetcher);
  await client.signup({ name: 'Ana', email: 'ana@example.com', password: 'long enough' });
  await client.login({ email: 'ana@example.com', password: 'long enough' });
  await client.me();
  assert.equal(await client.logout(), undefined);
  assert.deepEqual(calls.map(({ input, init }) => [input, init.method ?? 'GET']), [
    ['http://campus.example/api/auth/signup', 'POST'],
    ['http://campus.example/api/auth/login', 'POST'],
    ['http://campus.example/api/me', 'GET'],
    ['http://campus.example/api/auth/logout', 'POST'],
  ]);
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: 'Ana', email: 'ana@example.com', password: 'long enough' });
  assert.deepEqual(JSON.parse(calls[1].init.body), { email: 'ana@example.com', password: 'long enough' });
});

test('the multipart upload carries the Bearer token and a 401 signs out that token', async () => {
  const requests = [];
  const createXHR = () => {
    const request = { upload: {}, headers: {}, open() {}, setRequestHeader(name, value) { this.headers[name] = value; }, send() {}, abort() {} };
    requests.push(request);
    return request;
  };
  const expired = [];
  const client = createApiClient('http://campus.example', () => { throw Error('Unexpected fetch'); }, () => ({ append() {} }), createXHR,
    { token: () => 'tok-noah', onUnauthorized: (sent) => expired.push(sent) });
  const input = { eventId: 'ev/04', video: { uri: 'file:///a.mov', name: 'a.mov', type: 'video/quicktime' }, buildingId: 'b', destination: 'Room 1', startFloor: '1', destinationFloor: '1' };
  const pending = client.uploadRoute(input, () => {});
  assert.equal(requests[0].headers.Authorization, 'Bearer tok-noah');
  requests[0].status = 401;
  requests[0].responseText = '{"error":{"code":"unauthenticated","message":"Sign in to do this."}}';
  requests[0].onload();
  await assert.rejects(pending, (error) => error.code === 'unauthenticated');
  assert.deepEqual(expired, ['tok-noah']);
  const unreadable = client.uploadRoute(input, () => {});
  requests[1].status = 401;
  requests[1].responseText = '<html>';
  requests[1].onload();
  await assert.rejects(unreadable, (error) => error.status === 401);
  assert.deepEqual(expired, ['tok-noah', 'tok-noah']);
});
