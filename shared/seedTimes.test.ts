import { describe, expect, it } from 'vitest';
import seeds from './fixtures/events.seed.json';
import cases from './seedTimes.cases.json';
import { seedStart } from './seedTimes';

describe('seed half-hour scheduling', () => {
  it.each(cases)('matches the shared server case $now / $offset', ({ now, offset, start }) => {
    expect(seedStart(offset, new Date(now)).toISOString()).toBe(start);
  });

  it.each(['2026-11-19', '2026-03-08', '2026-11-01'])('keeps two live, three soon, and the remaining week in campus hours on %s', date => {
    const clock = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    for (let hour = 0; hour < 24; hour++) for (const minute of [0, 17, 30, 59]) {
      const now = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:26.123Z`);
      let live = 0, soon = 0;
      for (const seed of seeds) {
        const start = seedStart(seed.startsInMin, now);
        const end = start.getTime() + seed.durationMin * 60_000;
        expect(start.getTime()).toBeLessThan(now.getTime() + 7 * 24 * 60 * 60_000);
        expect(end).toBeGreaterThan(now.getTime());
        expect(start.getSeconds()).toBe(0);
        expect(start.getMilliseconds()).toBe(0);
        const fields = new Map(clock.formatToParts(start).map(part => [part.type, part.value]));
        const campusMinute = Number(fields.get('hour')) * 60 + Number(fields.get('minute'));
        expect(campusMinute % 30).toBe(0);
        if (start <= now) live++;
        else if (start.getTime() <= now.getTime() + 60 * 60_000) soon++;
        else {
          expect(campusMinute).toBeGreaterThanOrEqual(9 * 60);
          expect(campusMinute).toBeLessThanOrEqual(21 * 60);
        }
      }
      expect(live).toBe(2);
      expect(soon).toBe(3);
    }
  });
});
