import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiRequestError, createApiClient } from './client.ts';

const jsonFetcher = (result, calls) => async (input, init = {}) => {
  calls.push({ input: String(input), init });
  return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } });
};

test('uses the contract method, path, query, and JSON body for event and route endpoints', async () => {
  const calls = [];
  const client = createApiClient('https://campus.example/', jsonFetcher({ ok: true, pipelineMode: 'mock' }, calls));

  await client.health();
  await client.listEvents('week');
  await client.getEvent('event/one');
  await client.register('event/one', 'device-1');
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
  assert.deepEqual(JSON.parse(calls[3].init.body), { deviceId: 'device-1' });
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

  assert.equal(calls[0].input, 'http://campus.example/api/routes');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, form);
  assert.equal(calls[0].init.headers, undefined);
  assert.deepEqual(form.entries.map(([name]) => name), ['video', 'buildingId', 'destination', 'startFloor', 'destinationFloor', 'eventId']);
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
