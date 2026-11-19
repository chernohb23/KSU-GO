import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  initialStepperState, isConfirmedRoute, stepperReducer, stepperTransition, totalWalkingDistance,
} from './stepper.ts';

const route = JSON.parse(readFileSync(new URL('../../../shared/fixtures/route.sample.json', import.meta.url), 'utf8'));

test('next and back clamp at both ends without mutating state', () => {
  const initial = Object.freeze({ ...initialStepperState });
  assert.deepEqual(stepperReducer(initial, { type: 'back' }, 3), initial);
  let state = initial;
  for (let i = 0; i < 5; i += 1) state = stepperReducer(state, { type: 'next' }, 3);
  assert.deepEqual(state, { index: 2, playing: false });
  for (let i = 0; i < 5; i += 1) state = stepperReducer(state, { type: 'back' }, 3);
  assert.deepEqual(state, initial);
  assert.deepEqual(initial, { index: 0, playing: false });
});

test('play and pause preserve the current index and send the same playing state', () => {
  const start = { index: 1, playing: false };
  const playing = stepperTransition(start, { type: 'play' }, 4);
  assert.deepEqual(playing, {
    state: { index: 1, playing: true }, messages: [{ type: 'route:play', playing: true }],
  });
  assert.deepEqual(stepperTransition(playing.state, { type: 'pause' }, 4), {
    state: start, messages: [{ type: 'route:play', playing: false }],
  });
});

test('viewer stepChanged sets the index while paused and during play', () => {
  assert.deepEqual(stepperReducer(initialStepperState, { type: 'stepChanged', index: 1 }, 4), {
    index: 1, playing: false,
  });
  const result = stepperTransition({ index: 0, playing: true }, { type: 'stepChanged', index: 2 }, 4);
  assert.deepEqual(result, { state: { index: 2, playing: true }, messages: [] });
});

test('out-of-range and non-integer stepChanged values are ignored without stopping play', () => {
  const state = { index: 1, playing: true };
  for (const index of [-1, 3, 4, 1.5, NaN, Infinity]) {
    const result = stepperTransition(state, { type: 'stepChanged', index }, 3);
    assert.equal(result.state, state);
    assert.deepEqual(result.messages, []);
  }
});

test('the last viewer step stops play without echoing a goto', () => {
  assert.deepEqual(stepperTransition({ index: 1, playing: true }, { type: 'stepChanged', index: 2 }, 3), {
    state: { index: 2, playing: false }, messages: [{ type: 'route:play', playing: false }],
  });
  assert.deepEqual(stepperTransition({ index: 2, playing: false }, { type: 'play' }, 3), {
    state: { index: 2, playing: false }, messages: [{ type: 'route:play', playing: false }],
  });
});

test('next and back during play stop the viewer before going to the new index', () => {
  for (const [type, index] of [['next', 2], ['back', 0]]) {
    assert.deepEqual(stepperTransition({ index: 1, playing: true }, { type }, 4), {
      state: { index, playing: false },
      messages: [{ type: 'route:play', playing: false }, { type: 'route:goto', stepIndex: index }],
    });
  }
});

test('successive manual steps use the latest state and keep messages clamped', () => {
  let state = initialStepperState;
  for (const expected of [1, 2, 2]) {
    const result = stepperTransition(state, { type: 'next' }, 3);
    assert.deepEqual(result.messages, [{ type: 'route:goto', stepIndex: expected }]);
    assert.equal(result.state.index, expected);
    state = result.state;
  }
});

test('loaded resets the index and play state for a different route', () => {
  for (const stepCount of [0, 1, 2, 10]) {
    assert.deepEqual(stepperTransition({ index: 8, playing: true }, { type: 'loaded', stepCount }, 9), {
      state: initialStepperState, messages: [],
    });
  }
});

test('empty and single-step routes never produce an invalid index or start play', () => {
  for (const stepCount of [0, 1]) {
    for (const type of ['next', 'back', 'play', 'pause']) {
      assert.deepEqual(stepperReducer(initialStepperState, { type }, stepCount), initialStepperState);
    }
  }
  assert.deepEqual(stepperTransition(initialStepperState, { type: 'next' }, 0).messages, []);
  assert.equal(stepperReducer(initialStepperState, { type: 'stepChanged', index: 0 }, 0), initialStepperState);
});

test('distance includes walk lengths and horizontal stair runs, ignoring turns, doors and elevators', () => {
  const steps = [
    { type: 'door', label: 'Main entrance' }, { type: 'walk', lengthM: 8.1 },
    { type: 'stairs', direction: 'up', riseM: 100, runM: 2.88, toFloor: '2' },
    { type: 'turn', direction: 'right' }, { type: 'walk', lengthM: 3 },
    { type: 'elevator', toFloor: '3' }, { type: 'door', label: 'Room 204' },
  ];
  assert.equal(totalWalkingDistance({ ...route, steps }), 14);
});

test('distance rounds the combined distance once, including at the half-meter boundary', () => {
  assert.equal(totalWalkingDistance({ ...route, steps: [{ type: 'walk', lengthM: 0.3 },
    { type: 'stairs', direction: 'up', runM: 0.3, toFloor: null }] }), 1);
  for (const [lengthM, expected] of [[4.49, 4], [4.5, 5], [4.51, 5]]) {
    assert.equal(totalWalkingDistance({ ...route, steps: [{ type: 'walk', lengthM }] }), expected);
  }
});

test('distance works for a route with no walks, with stairs only, or with no steps', () => {
  assert.equal(totalWalkingDistance({ ...route, steps: [{ type: 'door', label: 'Entrance' },
    { type: 'elevator', toFloor: '2' }, { type: 'door', label: 'Room 204' }] }), 0);
  assert.equal(totalWalkingDistance({ ...route, steps: [{ type: 'stairs', direction: 'up',
    riseM: 1.8, runM: 2.88, toFloor: '2' }] }), 3);
  assert.equal(totalWalkingDistance({ ...route, steps: [] }), 0);
});

test('the student route guard accepts only confirmed routes', () => {
  assert.equal(isConfirmedRoute(route), true);
  for (const status of ['processing', 'draft', 'failed']) {
    assert.equal(isConfirmedRoute({ ...route, status }), false);
  }
  assert.equal(isConfirmedRoute(null), false);
});
