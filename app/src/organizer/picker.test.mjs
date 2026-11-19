import assert from 'node:assert/strict';
import test from 'node:test';

import { createVideoPicker } from './picker.ts';
import { videoFile } from './form.ts';

const chosen = (name) => ({ canceled: false, assets: [{
  uri: `file:///${name}`, fileName: name, mimeType: 'video/mp4', duration: 2_000, fileSize: 500,
}] });

function setup(readFile = videoFile) {
  const state = { file: null, error: '', picking: false };
  const select = createVideoPicker({
    readFile: async (asset) => readFile(asset),
    setFile: (file) => { state.file = file; },
    setError: (error) => { state.error = error; },
    setPicking: (picking) => { state.picking = picking; },
  });
  return { state, select };
}

test('a late Android picker result or error cannot overwrite the latest choice', async () => {
  for (const fail of [false, true]) {
    const { state, select } = setup();
    const pending = Promise.withResolvers();
    const restore = select('restore', () => pending.promise);
    await select('choose', async () => chosen('new.mp4'));
    if (fail) pending.reject(new Error('Old recovery error'));
    else pending.resolve(chosen('old.mp4'));
    await restore;
    assert.equal(state.file.name, 'new.mp4');
    assert.equal(state.error, '');
    assert.equal(state.picking, false);
  }
});

test('an older local file inspection cannot publish its result after the organizer chooses a video', async () => {
  const reading = Promise.withResolvers();
  const release = Promise.withResolvers();
  const { state, select } = setup(async (asset) => {
    if (asset.fileName === 'old.mp4') { reading.resolve(); await release.promise; }
    return videoFile(asset);
  });
  const restore = select('restore', async () => chosen('old.mp4'));
  await reading.promise;
  await select('choose', async () => chosen('latest.mp4'));
  release.resolve();
  await restore;
  assert.equal(state.file.name, 'latest.mp4');
});

test('Android restores its one-shot result once; cancelling a change retains that selection', async () => {
  const { state, select } = setup();
  let restores = 0;
  const pending = Promise.withResolvers();
  const recover = () => { restores++; return pending.promise; };
  const first = select('restore', recover);
  const replay = select('restore', recover);
  pending.resolve(chosen('recovered.mp4'));
  await Promise.all([first, replay]);
  assert.equal(restores, 1);
  assert.equal(state.file.name, 'recovered.mp4');
  await select('choose', async () => ({ canceled: true, assets: null }));
  assert.equal(state.file.name, 'recovered.mp4');
});

test('rapid taps open one native picker, and a rejected replacement can be corrected', async () => {
  const { state, select } = setup();
  let launches = 0;
  const pending = Promise.withResolvers();
  const launch = () => { launches++; return pending.promise; };
  const first = select('choose', launch);
  const second = select('choose', launch);
  assert.equal(state.picking, true);
  pending.resolve(chosen('first.mp4'));
  await Promise.all([first, second]);
  assert.equal(launches, 1);
  const invalid = chosen('too-long.mp4');
  invalid.assets[0].duration = 180_001;
  await select('choose', async () => invalid);
  assert.equal(state.file, null);
  assert.match(state.error, /3 minutes/);
  await select('choose', async () => chosen('replacement.mp4'));
  assert.equal(state.file.name, 'replacement.mp4');
  assert.equal(state.error, '');
  assert.equal(state.picking, false);
});

test('cancelling while Android restores a selected video keeps the recovery in either order', async () => {
  for (const cancelFirst of [true, false]) {
    const { state, select } = setup();
    const old = Promise.withResolvers();
    const dialog = Promise.withResolvers();
    const restore = select('restore', () => old.promise);
    const choose = select('choose', () => dialog.promise);
    if (cancelFirst) {
      dialog.resolve({ canceled: true, assets: null });
      await choose;
    }
    old.resolve(chosen('already-selected.mp4'));
    await restore;
    if (!cancelFirst) {
      dialog.resolve({ canceled: true, assets: null });
      await choose;
    }
    assert.equal(state.file?.name, 'already-selected.mp4');
    assert.equal(state.error, '');
    assert.equal(state.picking, false);
  }
});

test('changing then cancelling an iPhone Photos selection retains the original MOV for upload', async () => {
  const { state, select } = setup();
  const original = {
    uri: 'file:///tmp/ImagePicker/A1B2.MOV', fileName: 'IMG_0123.MOV',
    mimeType: 'video/quicktime', duration: 2_000, fileSize: 3_863_315,
  };
  await select('choose', async () => ({ canceled: false, assets: [original] }));
  await select('choose', async () => ({ canceled: true, assets: null }));
  assert.deepEqual(state.file, { uri: original.uri, name: original.fileName, type: original.mimeType });
  assert.equal(state.error, '');
  assert.equal(state.picking, false);
});
