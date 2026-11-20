import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { editSteps, nextIssue, canConfirm } from './review.ts';
import { OrganizerSession } from './session.ts';

const draft = JSON.parse(readFileSync(new URL('../../../shared/fixtures/routes/placeholder.draft.json', import.meta.url)));
const shortWalk = draft.steps.findIndex(step => step.id === 's12');
const storage = { getAllKeys: async () => [], setItem: async () => {} };

test('visits flagged steps in walking order and wraps, skipping route-level and passing checks', () => {
  const checks = [...draft.checks, { level: 'fail', stepId: null }, { level: 'pass', stepId: 's1' }];
  const route = { ...draft, checks };
  assert.equal(nextIssue(route, -1), 2);
  assert.equal(nextIssue(route, 2), shortWalk);
  assert.equal(nextIssue(route, shortWalk), shortWalk + 1);
  assert.equal(nextIssue(route, shortWalk + 1), 2);
  assert.equal(nextIssue({ ...route, checks: [] }, 2), -1);
});

test('only the chosen turn changes and approving preserves all fields except source', () => {
  for (const direction of ['left', 'right', 'u_left', 'u_right']) {
    const steps = editSteps(draft.steps, 2, { kind: 'turn', direction });
    assert.deepEqual(steps[2], { ...draft.steps[2], source: 'organizer', direction });
    assert.equal(steps[1], draft.steps[1]);
  }
  const approved = editSteps(draft.steps, 2, { kind: 'approve' });
  assert.deepEqual(approved[2], { ...draft.steps[2], source: 'organizer' });
  assert.equal(draft.steps[2].source, 'ai');
  assert.deepEqual(editSteps(draft.steps, shortWalk, { kind: 'delete' }), draft.steps.filter(step => step.id !== 's12'));
  for (const index of [0, draft.steps.length - 1]) {
    assert.equal(editSteps(draft.steps, index, { kind: 'delete' }), draft.steps);
  }
});

test('confirmation blocks all failing checks including route-level failures, but permits warnings', () => {
  assert.equal(canConfirm(draft), false);
  assert.equal(canConfirm({ ...draft, checks: [{ level: 'fail', stepId: null }] }), false);
  assert.equal(canConfirm({ ...draft, checks: draft.checks.filter(check => check.level === 'warn') }), true);
});

test('a failed save retains its exact steps for retry, blocks confirmation, then accepts fresh server checks', async () => {
  const steps = editSteps(draft.steps, shortWalk, { kind: 'delete' });
  const saved = { ...draft, steps, checks: draft.checks.filter(check => check.level !== 'fail') };
  const confirmed = { ...saved, status: 'confirmed' };
  let attempts = 0;
  let confirmations = 0;
  const session = new OrganizerSession({
    getRoute: async () => draft,
    updateRouteSteps: async (id, sent) => {
      assert.equal(id, draft.id);
      assert.equal(sent, steps);
      attempts++;
      if (attempts === 1) throw new Error('offline');
      return saved;
    },
    confirmRoute: async () => {
      confirmations++;
      return confirmed;
    },
  }, storage, [draft]);
  await session.read(draft.id);
  await session.review(draft.id, { kind: 'confirm' });
  assert.equal(confirmations, 0);
  await session.review(draft.id, { kind: 'save', steps });
  const pending = session.state.reviews[draft.id];
  assert.equal(pending.action.steps, steps);
  assert.ok(pending.error);
  await session.review(draft.id, { kind: 'confirm' });
  assert.equal(confirmations, 0);
  await session.review(draft.id, pending.action);
  assert.equal(session.state.reviews[draft.id], undefined);
  assert.equal(session.state.routes[draft.id], saved);
  await session.review(draft.id, { kind: 'confirm' });
  assert.equal(confirmations, 1);
  assert.equal(session.state.routes[draft.id], confirmed);
});

test('an edit made on a bundled draft can be retried after setting the first server address', async () => {
  const session = new OrganizerSession(null, storage, [draft]);
  const steps = editSteps(draft.steps, shortWalk, { kind: 'delete' });
  await session.review(draft.id, { kind: 'save', steps });
  assert.ok(session.state.reviews[draft.id].error);
  const saved = { ...draft, steps, checks: [] };
  session.setApi({ getRoute: async () => draft, updateRouteSteps: async () => saved });
  await session.read(draft.id);
  assert.equal(session.state.reviews[draft.id]?.action.steps, steps);
  await session.review(draft.id, session.state.reviews[draft.id].action);
  assert.equal(session.state.routes[draft.id], saved);
});

test('a stale read and duplicate tap cannot overwrite or resend a saved edit', async () => {
  const steps = editSteps(draft.steps, 2, { kind: 'approve' });
  const saved = { ...draft, steps };
  let finishRead, finishSave;
  let calls = 0;
  const api = {
    getRoute: async () => draft,
    updateRouteSteps: () => {
      calls++;
      return new Promise(resolve => { finishSave = resolve; });
    },
  };
  const session = new OrganizerSession(api, storage, []);
  await session.read(draft.id);
  api.getRoute = () => new Promise(resolve => { finishRead = resolve; });
  const oldRead = session.read(draft.id);
  const write = session.review(draft.id, { kind: 'save', steps });
  await session.review(draft.id, { kind: 'save', steps });
  assert.equal(calls, 1);
  finishSave(saved);
  await write;
  finishRead(draft);
  await oldRead;
  assert.equal(session.state.routes[draft.id], saved);
});
test('inserts an organizer turn between steps with a unique id', () => {
  const steps = editSteps(draft.steps, 2, { kind: 'insert_turn', direction: 'left', position: 'after' });
  assert.equal(steps.length, draft.steps.length + 1);
  assert.deepEqual(steps[3], { id: 'organizer-1', type: 'turn', direction: 'left', source: 'organizer', confidence: null, tSec: null, note: null });
  assert.equal(new Set(steps.map(step => step.id)).size, steps.length);
});

test('splits a walk of at least two metres into equal organizer walks with a turn', () => {
  const steps = editSteps(draft.steps, 7, { kind: 'split_walk', direction: 'right' });
  assert.equal(steps.length, draft.steps.length + 2);
  assert.deepEqual(steps.slice(7, 10).map(({ id, ...step }) => step), [
    { type: 'walk', lengthM: 1, source: 'organizer', confidence: null, tSec: null, note: null },
    { type: 'turn', direction: 'right', source: 'organizer', confidence: null, tSec: null, note: null },
    { type: 'walk', lengthM: 1, source: 'organizer', confidence: null, tSec: null, note: null },
  ]);
  assert.ok(steps.slice(7, 10).every(step => step.source === 'organizer'));
  assert.equal(new Set(steps.map(step => step.id)).size, steps.length);
  assert.deepEqual(editSteps(draft.steps, 8, { kind: 'split_walk', direction: 'left' }), draft.steps);
});

test('switches a stair flight direction and can insert an elevator before the destination door', () => {
  const switched = editSteps(draft.steps, 4, { kind: 'stairs_direction', direction: 'down', startFloor: draft.startFloor });
  assert.equal(switched[4].type, 'stairs');
  if (switched[4].type === 'stairs') assert.equal(switched[4].direction, 'down');
  const elevated = editSteps(draft.steps, 4, { kind: 'insert_elevator', toFloor: '3' });
  assert.deepEqual(elevated.at(-2), { id: 'organizer-1', type: 'elevator', toFloor: '3', source: 'organizer', confidence: null, tSec: null, note: null });
  assert.equal(elevated.at(-1)?.type, 'door');
  assert.equal(new Set(elevated.map(step => step.id)).size, elevated.length);
});

test('switching a numbered stair flight updates its floor transition', () => {
  const steps = draft.steps.map(step => step.id === 's7' ? { ...step, direction: 'down', toFloor: '1' } : step);
  const switched = editSteps(steps, steps.findIndex(step => step.id === 's7'), { kind: 'stairs_direction', direction: 'up', startFloor: draft.startFloor });
  const stair = switched.find(step => step.id === 's7');
  assert.equal(stair?.type, 'stairs');
  if (stair?.type === 'stairs') {
    assert.equal(stair.direction, 'up');
    assert.equal(stair.toFloor, '2');
  }
});
