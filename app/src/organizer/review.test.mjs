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
