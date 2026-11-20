import assert from 'node:assert/strict';
import test from 'node:test';
import { scopedStorage } from '../settings/scopedStorage.ts';
import { needsDiscoverHint, rememberDiscoverSwipe } from './tutorial.ts';

const makeDevice = () => {
  const values = new Map();
  return {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
    getAllKeys: async () => [...values.keys()],
  };
};

test('the first swipe is remembered across relaunches for that account only', async () => {
  const device = makeDevice();
  const maya = scopedStorage(device, 'maya');
  assert.equal(await needsDiscoverHint(maya), true);
  await rememberDiscoverSwipe(maya);
  assert.equal(await needsDiscoverHint(scopedStorage(device, 'maya')), false);
  assert.equal(await needsDiscoverHint(scopedStorage(device, 'noah')), true);
  assert.equal(await needsDiscoverHint(scopedStorage(device, 'guest')), true);
});

test('an unsuccessful preference write does not claim the hint was remembered', async () => {
  const device = makeDevice();
  const storage = { ...device, setItem: async () => { throw new Error('disk full'); } };
  await assert.rejects(rememberDiscoverSwipe(storage), /disk full/);
  assert.equal(await needsDiscoverHint(storage), true);
});
