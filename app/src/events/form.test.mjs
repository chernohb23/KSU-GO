import assert from 'node:assert/strict';
import test from 'node:test';

import { addTag, dayChipLabel, etToIso, eventRequestFields, formProblem, nextDays, timeSlots } from './form.ts';
import { computedEasternClock } from './format.ts';
import { countdown, insights, interests, upcomingRegistrations } from '../account/insights.ts';

const at = (iso) => new Date(iso);

test('ET wall times get the right offset, including both 2026 DST change days', () => {
  assert.equal(etToIso({ year: 2026, month: 11, day: 19 }, 18, 0), '2026-11-19T18:00:00-05:00');
  assert.equal(etToIso({ year: 2026, month: 7, day: 4 }, 12, 30), '2026-07-04T12:30:00-04:00');
  // Spring forward on Mar 8: 1:45 is still EST, 3:00 is EDT.
  assert.equal(etToIso({ year: 2026, month: 3, day: 8 }, 1, 45), '2026-03-08T01:45:00-05:00');
  assert.equal(etToIso({ year: 2026, month: 3, day: 8 }, 3, 0), '2026-03-08T03:00:00-04:00');
  // Fall back on Nov 1: 0:30 is EDT, 2:00 is EST.
  assert.equal(etToIso({ year: 2026, month: 11, day: 1 }, 0, 30), '2026-11-01T00:30:00-04:00');
  assert.equal(etToIso({ year: 2026, month: 11, day: 1 }, 2, 0), '2026-11-01T02:00:00-05:00');
  for (const [iso, hour] of [['2026-11-19T18:00:00-05:00', 18], ['2026-07-04T12:30:00-04:00', 12]]) {
    assert.equal(computedEasternClock(at(iso)).hour, hour);
  }
});

test('the next seven campus days start today in ET, even late at night in UTC', () => {
  const now = at('2026-11-20T03:30:00Z'); // Thu Nov 19, 10:30 PM ET
  const days = nextDays(now, computedEasternClock);
  assert.equal(days.length, 7);
  assert.deepEqual(days[0], { year: 2026, month: 11, day: 19, weekday: 4 });
  assert.deepEqual(days[6], { year: 2026, month: 11, day: 25, weekday: 3 });
  assert.deepEqual(dayChipLabel(days[0], 0), { top: 'Today', bottom: 'Nov 19' });
  assert.deepEqual(dayChipLabel(days[1], 1), { top: 'Fri', bottom: 'Nov 20' });
});

test('time slots are 15 minutes apart and stay inside now < start < now + 7 days', () => {
  const now = at('2026-11-19T22:10:00Z'); // 5:10 PM ET
  const days = nextDays(now, computedEasternClock);
  const today = timeSlots(days[0], now);
  assert.equal(today[0].label, '5:15 PM');
  assert.equal(today.at(-1).label, '11:45 PM');
  assert.ok(today.every((slot) => slot.minute % 15 === 0));
  // Seven chips: today and six more days, each wholly inside the window.
  assert.equal(timeSlots(days[6], now).length, 96);
  // A start exactly 7 days out is outside the window.
  const eighth = { year: 2026, month: 11, day: 26, weekday: 4 };
  assert.equal(timeSlots(eighth, now).at(-1).label, '5:00 PM');
  assert.equal(timeSlots(days[3], now).length, 96);
});

test('the form names its first problem and builds the request body', () => {
  const values = {
    title: 'Build Night', description: 'Wire the drive base.', category: 'academic', buildingId: 'b-mathematics',
    room: '113', startsAt: '2026-11-20T18:00:00-05:00', durationMin: 90, capacity: '', partnerOrganizationId: null, tags: ['robots'],
  };
  assert.equal(formProblem(values, false), null);
  assert.equal(formProblem({ ...values, category: null }, false), 'Choose a category.');
  assert.equal(formProblem({ ...values, startsAt: null }, false), 'Choose a day and a start time.');
  assert.equal(formProblem({ ...values, startsAt: null }, true), null); // an edit may keep the start
  assert.equal(formProblem({ ...values, capacity: '0' }, false), 'Capacity is a whole number, or leave it empty.');
  assert.deepEqual(eventRequestFields({ ...values, capacity: '24' }, null), {
    title: 'Build Night', description: 'Wire the drive base.', category: 'academic', partnerOrganizationId: null,
    tags: ['robots'], startsAt: '2026-11-20T18:00:00-05:00', durationMin: 90,
    location: { buildingId: 'b-mathematics', room: '113' }, capacity: 24,
  });
  assert.equal(eventRequestFields({ ...values, startsAt: null }, '2026-11-19T17:00:00Z').startsAt, '2026-11-19T17:00:00Z');
});

test('tags are trimmed, lowercased, unique and capped like the server', () => {
  assert.deepEqual(addTag([], '  Robots '), ['robots']);
  assert.deepEqual(addTag(['robots'], 'ROBOTS'), ['robots']);
  assert.deepEqual(addTag([], 'x'.repeat(25)), []);
  assert.deepEqual(addTag(Array.from({ length: 8 }, (_, i) => `t${i}`), 'more').length, 8);
});

const event = (id, startsAt, endsAt, extra = {}) => ({ id, startsAt, endsAt, status: 'active', category: 'academic', ...extra });

test('insights count real registrations this campus month, upcoming ones, saves and follows', () => {
  const now = at('2026-11-19T17:00:00Z');
  const registrations = [
    { event: event('a', '2026-11-19T18:00:00Z', '2026-11-19T19:00:00Z'), registeredAt: '2026-11-02T15:00:00Z' },
    { event: event('b', '2026-11-18T18:00:00Z', '2026-11-18T19:00:00Z'), registeredAt: '2026-11-01T03:30:00Z' }, // 11:30 PM ET on Oct 31 (EDT)
    { event: event('c', '2026-11-21T18:00:00Z', '2026-11-21T19:00:00Z', { status: 'cancelled' }), registeredAt: '2026-11-10T15:00:00Z' },
  ];
  assert.deepEqual(insights({ registrations, savedCount: 4, followingCount: 2, now, clock: computedEasternClock }),
    { registeredThisMonth: 2, upcoming: 1, saved: 4, following: 2 });
  assert.deepEqual(upcomingRegistrations(registrations, now).map((e) => e.id), ['a', 'c']);
});

test('countdowns read naturally and cancelled events say so', () => {
  const now = at('2026-11-19T17:00:00Z'); // noon ET
  assert.equal(countdown(event('x', '2026-11-19T16:30:00Z', '2026-11-19T18:00:00Z'), now), 'Happening now');
  assert.equal(countdown(event('x', '2026-11-19T17:25:00Z', '2026-11-19T18:00:00Z'), now), 'Starts in 25 min');
  assert.equal(countdown(event('x', '2026-11-19T19:15:00Z', '2026-11-19T20:00:00Z'), now), 'Starts in 2 h 15 min');
  assert.equal(countdown(event('x', '2026-11-19T19:00:00Z', '2026-11-19T20:00:00Z'), now), 'Starts in 2 h');
  assert.match(countdown(event('x', '2026-11-20T23:00:00Z', '2026-11-21T00:00:00Z'), now), /^Tomorrow, 6:00 PM ET$/);
  assert.equal(countdown(event('x', '2026-11-19T19:00:00Z', '2026-11-19T20:00:00Z', { status: 'cancelled' }), now), 'Cancelled');
});

test('interests are the top three categories, most first', () => {
  assert.deepEqual(interests(['arts', 'career', 'arts', 'sports', 'career', 'arts', 'social']), ['arts', 'career', 'social']);
  assert.deepEqual(interests([]), []);
});
