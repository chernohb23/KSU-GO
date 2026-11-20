import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { eventsInRange, getEventFlagState, loadFixtureEvents } from './events.ts';
import { findFixtureRoute } from './routes.ts';
import { eventChoice, rankDeck, swipeDecision } from '../week/choices.ts';

const now = new Date('2026-11-17T12:00:00.000Z');

function seedEvent(id, startsInMin, durationMin) {
  return {
    id,
    title: id,
    description: '',
    organizationId: 'org-test',
    organizer: 'Test organizer',
    partnerOrganizationId: null,
    category: 'other',
    tags: [],
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

test('two saves outweigh two skips even when the preferred category starts later', () => {
  const seeds = ['save1', 'save2', 'skip1', 'skip2', 'early', 'late', 'tie'].map((id, i) => ({
    ...seedEvent(id, i + 1, 60),
    category: ['save1', 'save2', 'late', 'tie'].includes(id) ? 'arts' : 'sports',
    organizer: id,
  }));
  const events = loadFixtureEvents(seeds, now, 'week');
  const votes = events.slice(0, 4).map((event, i) => eventChoice(event, i < 2 ? 'save' : 'skip'));
  assert.deepEqual(rankDeck(events, votes).map(e => e.id), ['late', 'tie', 'early']);
});

test('organizer preferences influence cards in other categories', () => {
  const [saved, early, late] = loadFixtureEvents([
    seedEvent('saved', 0, 60), seedEvent('early', 1, 60), seedEvent('late', 2, 60),
  ], now, 'week');
  early.organizer = 'Elsewhere';
  late.category = 'arts';
  early.category = 'career';
  assert.deepEqual(rankDeck([early, late], [eventChoice(saved, 'save')]).map(e => e.id), ['late', 'early']);
});

test('today on the map excludes ended and week-only cards', () => {
  const week = loadFixtureEvents([seedEvent('live', -5, 60), seedEvent('edge', 24 * 60, 60)], now, 'week');
  const ended = { ...week[0], id: 'ended', endsAt: now.toISOString() };
  assert.deepEqual(eventsInRange([...week, ended], now, 'today').map(e => e.id), ['live']);
});

test('half swipes and canceled swipes leave the card in the deck', () => {
  assert.equal(swipeDecision(175, 350, false), null);
  assert.equal(swipeDecision(-175, 350, false), null);
  assert.equal(swipeDecision(300, 350, true), null);
  assert.equal(swipeDecision(180, 350, false), 'save');
  assert.equal(swipeDecision(-180, 350, false), 'skip');
});

test('every linked seed event opens a confirmed offline route to its room', async () => {
  const fixtures = new URL('../../../shared/fixtures/', import.meta.url);
  const readFixture = async name => JSON.parse(await readFile(new URL(name, fixtures), 'utf8'));
  const files = await readdir(new URL('routes/', fixtures));
  const routes = await Promise.all([
    ...files.filter(file => file.endsWith('.json')).map(file => readFixture('routes/' + file)),
    readFixture('route.sample.json'),
  ]);
  const events = await readFixture('events.seed.json');
  const linked = events.filter(event => event.routeId !== null);
  assert.ok(linked.length > 0, 'The offline demo needs an event with a route');
  for (const event of linked) {
    const route = findFixtureRoute(routes, event.routeId);
    assert.equal(route?.status, 'confirmed', event.title);
    assert.equal(route.buildingId, event.location.buildingId, event.title);
    assert.equal(route.steps.at(-1)?.type, 'door', event.title);
    assert.equal(route.steps.at(-1)?.label, route.destination, event.title);
  }
});
