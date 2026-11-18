import assert from 'node:assert/strict';
import test from 'node:test';

import { getEventFlagState, loadFixtureEvents } from './events.ts';
import { findFixtureRoute } from './routes.ts';

const now = new Date('2026-11-17T12:00:00.000Z');

function seedEvent(id, startsInMin, durationMin) {
  return {
    id,
    title: id,
    description: '',
    organizer: 'Test organizer',
    category: 'other',
    startsInMin,
    durationMin,
    location: { buildingId: 'b-library', room: '101' },
    routeId: null,
    capacity: null,
    registeredCount: 0,
  };
}

test('converts fixture offsets, omits ended/out-of-range events, and sorts by start', () => {
  const events = loadFixtureEvents(
    [seedEvent('later', 80, 30), seedEvent('live', -15, 60), seedEvent('ended', -60, 30), seedEvent('week-only', 24 * 60, 30)],
    now,
    'today',
  );

  assert.deepEqual(events.map(({ id }) => id), ['live', 'later']);
  assert.equal(events[0]?.startsAt, '2026-11-17T11:45:00.000Z');
  assert.equal(events[0]?.endsAt, '2026-11-17T12:45:00.000Z');
});

test('includes starts strictly inside today and week windows', () => {
  const seeds = [seedEvent('today-edge', 24 * 60 - 1, 60), seedEvent('at-24h', 24 * 60, 60), seedEvent('week-edge', 7 * 24 * 60 - 1, 60), seedEvent('at-week', 7 * 24 * 60, 60)];

  assert.deepEqual(loadFixtureEvents(seeds, now, 'today').map(({ id }) => id), ['today-edge']);
  assert.deepEqual(loadFixtureEvents(seeds, now, 'week').map(({ id }) => id), ['today-edge', 'at-24h', 'week-edge']);
});

test('classifies event flags at live, soon, and later boundaries', () => {
  const event = (id, startsInMin, durationMin) => ({
    ...seedEvent(id, startsInMin, durationMin),
    startsAt: new Date(now.getTime() + startsInMin * 60_000).toISOString(),
    endsAt: new Date(now.getTime() + (startsInMin + durationMin) * 60_000).toISOString(),
  });

  assert.equal(getEventFlagState(event('live', 0, 30), now), 'live');
  assert.equal(getEventFlagState(event('soon', 60, 30), now), 'soon');
  assert.equal(getEventFlagState(event('later', 61, 30), now), 'later');
  assert.equal(getEventFlagState(event('ended', -31, 30), now), 'ended');
});

test('finds a bundled route by id and returns null for an unknown id', () => {
  const routes = [{ id: 'route-sample' }, { id: 'route-placeholder-draft' }];

  assert.equal(findFixtureRoute(routes, 'route-placeholder-draft')?.id, 'route-placeholder-draft');
  assert.equal(findFixtureRoute(routes, 'missing'), null);
});
