import assert from 'node:assert/strict';
import test from 'node:test';

import { directionsRow } from './directions.ts';
import { fixtureOrganizations, ownedOrganizations } from './organizations.ts';

test('the five directions states choose view, upload, progress, review and retry', () => {
  assert.deepEqual(['confirmed', 'none', 'processing', 'draft', 'failed'].map(directionsRow), [
    { label: 'Directions ready', action: 'view' },
    { label: 'Add directions', action: 'upload' },
    { label: 'Directions in progress', action: null },
    { label: 'Review draft', action: 'review' },
    { label: 'Try again', action: 'upload' },
  ]);
});

test('offline organizations have zero followers; the switcher uses ownership order', () => {
  const organizations = fixtureOrganizations([{ id: 'b', name: 'Z Club', ownerId: 'user-1' }, { id: 'a', name: 'A Club', ownerId: null }]);
  assert.deepEqual(organizations.map((org) => [org.id, org.followerCount]), [['a', 0], ['b', 0]]);
  assert.deepEqual(ownedOrganizations(organizations, ['b', 'missing', 'a']).map((org) => org.id), ['b', 'a']);
  assert.deepEqual(ownedOrganizations(organizations, []), []);
});
