import assert from 'node:assert/strict';
import test from 'node:test';
import { dockLayout } from './dockLayout.ts';

test('dock clearance stays above the home indicator and leaves room for the last control', () => {
  for (const safe of [0, 8, 21, 34, 48, 80]) {
    const layout = dockLayout(safe);
    assert.ok(layout.bottom >= safe);
    assert.ok(layout.bottom >= 16);
    assert.ok(layout.clearance >= layout.bottom + 72 + 24);
  }
  assert.equal(dockLayout(-10).bottom, dockLayout(0).bottom);
});
