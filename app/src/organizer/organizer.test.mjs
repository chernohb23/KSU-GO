import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiRequestError } from '../api/client.ts';
import { defaultDestinationFloor, uploadInput, videoFile } from './form.ts';
import { OrganizerSession, ROUTE_POLL_MS } from './session.ts';

const event = { id: 'ev-04', location: { buildingId: 'b-mathematics', room: '204' } };
const asset = { uri: 'file:///clip.MOV', fileName: 'clip.MOV', mimeType: 'video/quicktime', fileSize: 100_000_000, duration: 180_000 };
const file = { uri: asset.uri, name: 'clip.MOV', type: 'video/quicktime' };
const input = { eventId: event.id, buildingId: event.location.buildingId, destination: 'Room 204', startFloor: '1', destinationFloor: '2', video: file };
const draft = { id: 'bundled', status: 'draft', destination: 'Room 204' };
const processing = { ...draft, id: 'uploaded', status: 'processing', progress: { stage: 'ingest', pct: 0 } };

function device() {
  const data = new Map();
  return { getAllKeys: async () => [...data.keys()], setItem: async (k, v) => { data.set(k, v); } };
}

test('uses the event room and building, editable whole floors, and original video', () => {
  assert.equal(defaultDestinationFloor('Studio 105'), '1');
  assert.equal(defaultDestinationFloor('Lobby'), '');
  assert.equal(defaultDestinationFloor('204'), '2');
  assert.deepEqual(videoFile(asset), file);
  assert.deepEqual(videoFile({ ...asset, fileName: null, mimeType: null }), file);
  assert.deepEqual(uploadInput(event, ' 1 ', '2', file), input);
  assert.equal(uploadInput(event, '-1', '3', file).destinationFloor, '3');
  for (const value of ['', '2nd', '1.5']) assert.throws(() => uploadInput(event, '1', value, file), /whole/i);
});

test('enforces decimal MB and milliseconds before upload, including missing metadata', () => {
  assert.doesNotThrow(() => videoFile(asset));
  assert.throws(() => videoFile({ ...asset, fileSize: 100_000_001 }), /100 MB/);
  assert.throws(() => videoFile({ ...asset, duration: 180_001 }), /3 minutes/);
  for (const value of [undefined, null, 0, NaN]) {
    assert.throws(() => videoFile({ ...asset, fileSize: value }), /size/i);
    assert.throws(() => videoFile({ ...asset, duration: value }), /duration/i);
  }
});

test('a draft can open during transfer; an interrupted upload retries with the same file and persists only the accepted ID', async () => {
  const storage = device();
  const attempts = [];
  let finish;
  const api = {
    uploadRoute: (body, progress) => {
      attempts.push(body);
      progress(31);
      return new Promise((resolve, reject) => { finish = { resolve, reject }; });
    },
    getRoute: async () => draft,
  };
  const session = new OrganizerSession(api, storage, [draft]);
  const first = session.upload(input);
  await session.refresh();
  assert.deepEqual(session.state.routes.bundled, draft);
  assert.equal(session.state.transfer.percent, 31);
  await session.upload(input);
  assert.equal(attempts.length, 1);
  finish.reject(new TypeError('Network request failed'));
  await first;
  assert.equal(session.state.transfer.phase, 'error');
  assert.deepEqual(await storage.getAllKeys(), []);
  const retry = session.upload(session.state.transfer.input);
  finish.resolve(processing);
  await retry;
  assert.deepEqual(attempts, [input, input]);
  assert.equal(session.state.transfer.routeId, 'uploaded');
  assert.deepEqual(session.state.routes.uploaded, processing);
  assert.equal((await storage.getAllKeys()).length, 1);

  const calls = [];
  let next = processing;
  const reopened = new OrganizerSession({ ...api, getRoute: async (id) => { calls.push(id); return id === draft.id ? draft : next; } }, storage, [draft]);
  await reopened.refresh();
  assert.deepEqual(calls.sort(), ['bundled', 'uploaded']);
  next = { ...processing, progress: { stage: 'verify', pct: 80 } };
  await reopened.poll();
  assert.deepEqual(reopened.state.routes.uploaded.progress, next.progress);
  next = { ...draft, id: 'uploaded' };
  await reopened.poll();
  assert.equal(reopened.state.routes.uploaded.status, 'draft');
  const readCount = calls.length;
  await reopened.poll();
  assert.equal(calls.length, readCount);
  assert.equal(ROUTE_POLL_MS, 3_000);
});

test('bundled drafts open offline, server results win, and transient read failures recover', async () => {
  const storage = device();
  const offline = new OrganizerSession(null, storage, [draft]);
  await offline.refresh();
  assert.deepEqual(offline.state.routes.bundled, draft);
  let answer = new TypeError('unreachable');
  const session = new OrganizerSession({ getRoute: async () => { if (answer instanceof Error) throw answer; return answer; } }, storage, [draft]);
  await session.refresh();
  assert.deepEqual(session.state.routes.bundled, draft);
  answer = { ...draft, status: 'confirmed' };
  await session.poll();
  assert.equal(session.state.routes.bundled.status, 'confirmed');
  answer = new ApiRequestError(404, 'not_found', 'Route not found');
  await session.refresh();
  assert.equal(session.state.routes.bundled, undefined);
});

for (const [code, message] of [['video_rejected', /video/i], ['budget_exceeded', /budget|spend/i]]) {
  test(`explains the upload error ${code}`, async () => {
    const session = new OrganizerSession({ uploadRoute: async () => { throw new ApiRequestError(422, code, 'Server detail'); } }, device(), []);
    await session.upload(input);
    assert.equal(session.state.transfer.phase, 'error');
    assert.match(session.state.transfer.message, message);
  });
}

test('retry survives a replacement server URL and old route reads cannot replace new results', async () => {
  let finishOldRead;
  const first = {
    uploadRoute: async () => { throw new Error('tunnel closed'); },
    getRoute: () => new Promise((resolve) => { finishOldRead = resolve; }),
  };
  const session = new OrganizerSession(first, device(), [draft]);
  await session.upload(input);
  const pending = session.read(draft.id);
  session.setApi({ uploadRoute: async () => processing, getRoute: async () => ({ ...draft, status: 'confirmed' }) });
  await session.refresh();
  finishOldRead(draft);
  await pending;
  assert.equal(session.state.routes.bundled.status, 'confirmed');
  assert.deepEqual(session.state.transfer.input, input);
  await session.upload(session.state.transfer.input);
  assert.equal(session.state.transfer.routeId, processing.id);
});

test('uses the local copy when the picker omits its size and stops reading an oversized file', async () => {
  const { selectedVideoFile } = await import('./form.ts');
  const missing = { ...asset, fileSize: undefined };
  let opened = false;
  assert.deepEqual(await selectedVideoFile(asset, () => { opened = true; }), file);
  assert.equal(opened, false);
  assert.deepEqual(await selectedVideoFile(missing, async () => new Response(new Uint8Array(30))), file);
  let reads = 0;
  const tooLarge = async () => ({ ok: true, headers: new Headers(), body: { getReader: () => ({
    read: async () => { reads++; return { done: false, value: { byteLength: 60_000_000 } }; },
  }) } });
  await assert.rejects(selectedVideoFile(missing, tooLarge), /100 MB/);
  assert.equal(reads, 2);
});

test('remembers an accepted upload after storage recovers without sending the video a second time', async () => {
  const storage = device();
  let failSave = true;
  let sent = 0;
  const session = new OrganizerSession({
    uploadRoute: async () => { sent++; return processing; },
    getRoute: async () => processing,
  }, { ...storage, setItem: async (key, value) => {
    if (failSave) throw new Error('Storage temporarily unavailable');
    return storage.setItem(key, value);
  } }, []);
  await session.upload(input);
  assert.equal(session.state.transfer.phase, 'accepted');
  assert.match(session.state.storageNotice, /accepted/);
  failSave = false;
  await session.refresh();
  assert.equal(sent, 1);
  assert.equal((await storage.getAllKeys()).length, 1);
  assert.equal(session.state.storageNotice, null);
});
