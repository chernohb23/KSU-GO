import assert from 'node:assert/strict';
import test from 'node:test';

import {
  capacityLabel, computedEasternClock, createEasternFormat, intlEasternClock, isEasternDaylightTime, selectEasternClock,
} from './format.ts';

const realIntl = (options) => new Intl.DateTimeFormat('en-US', options);
const intlClock = intlEasternClock(realIntl);
const clocks = [['computed', computedEasternClock], ['intl', intlClock]];
const pick = ({ year, month, day, hour, minute, weekday }) => ({ year, month, day, hour, minute, weekday });

// Instants on both sides of each daylight-time change, as [UTC instant, Eastern wall clock].
const BOUNDARIES = [
  // 2026 spring forward: Sunday Mar 8, 2:00 EST becomes 3:00 EDT (07:00 UTC).
  ['2026-03-08T06:59:59Z', { year: 2026, month: 3, day: 8, hour: 1, minute: 59, weekday: 0 }],
  ['2026-03-08T07:00:00Z', { year: 2026, month: 3, day: 8, hour: 3, minute: 0, weekday: 0 }],
  // 2026 fall back: Sunday Nov 1, 2:00 EDT becomes 1:00 EST (06:00 UTC).
  ['2026-11-01T05:59:59Z', { year: 2026, month: 11, day: 1, hour: 1, minute: 59, weekday: 0 }],
  ['2026-11-01T06:00:00Z', { year: 2026, month: 11, day: 1, hour: 1, minute: 0, weekday: 0 }],
  // 2027: second Sunday of March is the 14th, first Sunday of November is the 7th.
  ['2027-03-14T06:59:00Z', { year: 2027, month: 3, day: 14, hour: 1, minute: 59, weekday: 0 }],
  ['2027-03-14T07:00:00Z', { year: 2027, month: 3, day: 14, hour: 3, minute: 0, weekday: 0 }],
  ['2027-11-07T05:59:00Z', { year: 2027, month: 11, day: 7, hour: 1, minute: 59, weekday: 0 }],
  ['2027-11-07T06:00:00Z', { year: 2027, month: 11, day: 7, hour: 1, minute: 0, weekday: 0 }],
  // Midnight and the day before in UTC terms.
  ['2026-11-20T04:30:00Z', { year: 2026, month: 11, day: 19, hour: 23, minute: 30, weekday: 4 }],
  ['2026-11-20T05:00:00Z', { year: 2026, month: 11, day: 20, hour: 0, minute: 0, weekday: 5 }],
  ['2026-07-04T16:00:00Z', { year: 2026, month: 7, day: 4, hour: 12, minute: 0, weekday: 6 }],
];

for (const [name, clock] of clocks) {
  test(`${name} clock gives Eastern wall time across the DST boundaries`, () => {
    for (const [iso, expected] of BOUNDARIES) assert.deepEqual(pick(clock(new Date(iso))), expected, iso);
  });
}

test('daylight time follows the US rules', () => {
  assert.equal(isEasternDaylightTime(new Date('2026-03-08T06:59:59Z')), false);
  assert.equal(isEasternDaylightTime(new Date('2026-03-08T07:00:00Z')), true);
  assert.equal(isEasternDaylightTime(new Date('2026-11-01T05:59:59Z')), true);
  assert.equal(isEasternDaylightTime(new Date('2026-11-01T06:00:00Z')), false);
  assert.equal(isEasternDaylightTime(new Date('2026-01-15T12:00:00Z')), false);
});

test('Intl is used when it formats America/New_York correctly', () => {
  assert.equal(selectEasternClock(realIntl).source, 'intl');
});

test('falls back to computed Eastern time when Intl lacks the zone or gets it wrong', () => {
  const throws = () => { throw new RangeError('Unsupported time zone'); };
  assert.equal(selectEasternClock(throws).source, 'computed');
  // An engine that ignores timeZone and formats UTC.
  const utcOnly = (options) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
  assert.equal(selectEasternClock(utcOnly).source, 'computed');
  // An engine with a different output shape.
  const unreadable = () => ({ format: () => 'Thursday' });
  assert.equal(selectEasternClock(unreadable).source, 'computed');
  // An engine writing midnight as 24:00 still reads correctly.
  const midnight24 = (options) => {
    const inner = new Intl.DateTimeFormat('en-US', options);
    return { format: (date) => inner.format(date).replace(/, 00:/, ', 24:').replace(/(\d+)\/(\d+)\/(\d+), 24:/, (_, m, d, y) => {
      const previous = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) - 1));
      return `${previous.getUTCMonth() + 1}/${previous.getUTCDate()}/${previous.getUTCFullYear()}, 24:`;
    }) };
  };
  assert.deepEqual(pick(intlEasternClock(midnight24)(new Date('2026-11-20T05:00:00Z'))),
    { year: 2026, month: 11, day: 20, hour: 0, minute: 0, weekday: 5 });
});

for (const [name, clock] of clocks) {
  const et = createEasternFormat(clock);
  const now = new Date('2026-11-19T17:00:00Z'); // Thu Nov 19, 12:00 PM ET

  test(`${name}: labels times ET in campus time whatever the phone's zone`, () => {
    assert.equal(et.time('2026-11-19T17:30:00Z'), '12:30 PM');
    assert.equal(et.time('2026-11-20T05:00:00Z'), '12:00 AM');
    assert.equal(et.dateTime('2026-11-19T23:05:00Z'), 'Thu, Nov 19, 6:05 PM ET');
    assert.equal(et.dateTime('2026-11-20T04:30:00Z'), 'Thu, Nov 19, 11:30 PM ET');
    assert.equal(et.range('2026-11-19T17:30:00Z', '2026-11-19T19:00:00Z', now), 'Today, 12:30 PM – 2:00 PM ET');
    assert.equal(et.range('2026-11-21T03:00:00Z', '2026-11-21T06:00:00Z', now),
      'Fri, Nov 20, 10:00 PM – Sat, Nov 21, 1:00 AM ET');
    assert.equal(et.time('2026-07-04T16:00:00Z'), '12:00 PM');
    assert.equal(et.when('2026-11-19T17:30:00Z', now), 'Today, 12:30 PM ET');
    assert.equal(et.when('2026-11-21T14:00:00Z', now), 'Saturday, Nov 21, 9:00 AM ET');
  });

  test(`${name}: day labels and sections use the campus day`, () => {
    assert.equal(et.dayLabel('2026-11-19T23:00:00Z', now), 'Today');
    assert.equal(et.dayLabel('2026-11-20T04:59:00Z', now), 'Today'); // 11:59 PM ET
    assert.equal(et.dayLabel('2026-11-20T05:00:00Z', now), 'Tomorrow');
    assert.equal(et.dayLabel('2026-11-21T15:00:00Z', now), 'Saturday, Nov 21');
    const sections = et.sections([
      { id: 'a', startsAt: '2026-11-19T18:00:00Z' },
      { id: 'b', startsAt: '2026-11-20T04:30:00Z' },
      { id: 'c', startsAt: '2026-11-20T14:00:00Z' },
      { id: 'd', startsAt: '2026-11-22T14:00:00Z' },
    ], now);
    assert.deepEqual(sections.map((s) => [s.title, s.data.map((e) => e.id)]), [
      ['Today', ['a', 'b']], ['Tomorrow', ['c']], ['Sunday, Nov 22', ['d']],
    ]);
  });
}

test('capacity is display only: "34 / 50", "Full" at or past capacity, or a plain count', () => {
  assert.equal(capacityLabel({ registeredCount: 34, capacity: 50 }), '34 / 50');
  assert.equal(capacityLabel({ registeredCount: 49, capacity: 50 }), '49 / 50');
  assert.equal(capacityLabel({ registeredCount: 50, capacity: 50 }), 'Full');
  assert.equal(capacityLabel({ registeredCount: 51, capacity: 50 }), 'Full');
  assert.equal(capacityLabel({ registeredCount: 0, capacity: 1 }), '0 / 1');
  assert.equal(capacityLabel({ registeredCount: 12, capacity: null }), '12 registered');
});
