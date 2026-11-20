import assert from 'node:assert/strict';
import test from 'node:test';

import { INTERESTS_KEY, parseInterests, toggleInterest } from './preferences.ts';
import { scopedStorage } from '../settings/scopedStorage.ts';

test('missing preferences use suggestions; a saved empty selection stays empty', () => {
  assert.equal(parseInterests(null), null);
  assert.equal(parseInterests('{broken'), null);
  assert.equal(parseInterests('{}'), null);
  assert.deepEqual(parseInterests('[]'), []);
  assert.deepEqual(parseInterests('["arts","invalid","arts","career"]'), ['career', 'arts']);
  assert.deepEqual(toggleInterest(['arts'], 'career'), ['arts', 'career']);
  assert.deepEqual(toggleInterest(['arts', 'career'], 'arts'), ['career']);
});

test('interest edits persist per account on this phone', async () => {
  const values = new Map();
  const storage = { getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); }, removeItem: async (key) => { values.delete(key); },
    getAllKeys: async () => [...values.keys()], multiRemove: async () => {} };
  await scopedStorage(storage, 'maya').setItem(INTERESTS_KEY, '["arts"]');
  assert.deepEqual(parseInterests(await scopedStorage(storage, 'maya').getItem(INTERESTS_KEY)), ['arts']);
  assert.equal(parseInterests(await scopedStorage(storage, 'noah').getItem(INTERESTS_KEY)), null);
});
