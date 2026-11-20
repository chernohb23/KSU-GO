// Campus time for every event time in the app: America/New_York, labeled "ET".
//
// Hermes may ship without full time-zone data, so the Intl path is used only
// after it formats known instants correctly. Otherwise Eastern time is computed
// from the US rules: daylight time from the second Sunday of March at 2:00
// until the first Sunday of November at 2:00.

import type { Event } from '../../../shared/types.ts';

export type EasternClock = (date: Date) => EasternTime;
export type EasternTime = {
  year: number; month: number; day: number; hour: number; minute: number;
  /** 0 is Sunday. */
  weekday: number;
};

const ZONE = 'America/New_York';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function nthSundayUtc(year: number, monthIndex: number, nth: number): number {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const firstSunday = 1 + ((7 - first.getUTCDay()) % 7);
  return Date.UTC(year, monthIndex, firstSunday + 7 * (nth - 1));
}

/** True while US Eastern daylight time is in effect at this instant. */
export function isEasternDaylightTime(date: Date): boolean {
  const year = date.getUTCFullYear();
  // 2:00 EST is 07:00 UTC; 2:00 EDT is 06:00 UTC.
  const start = nthSundayUtc(year, 2, 2) + 7 * HOUR_MS;
  const end = nthSundayUtc(year, 10, 1) + 6 * HOUR_MS;
  const t = date.getTime();
  return t >= start && t < end;
}

function wallClock(utcMs: number): EasternTime {
  const shifted = new Date(utcMs);
  return {
    year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes(), weekday: shifted.getUTCDay(),
  };
}

/** Eastern time computed from the UTC offset and the US daylight-time rules. */
export const computedEasternClock: EasternClock = (date) => {
  const offsetHours = isEasternDaylightTime(date) ? -4 : -5;
  return wallClock(date.getTime() + offsetHours * HOUR_MS);
};

type FormatterFactory = (options: Intl.DateTimeFormatOptions) => { format(date: Date): string };

const NUMERIC: Intl.DateTimeFormatOptions = {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
};

/** Eastern time read from Intl with numeric fields only ("11/19/2026, 12:00"). */
export function intlEasternClock(factory: FormatterFactory): EasternClock {
  const formatter = factory(NUMERIC);
  return (date) => {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})/.exec(formatter.format(date));
    if (!match) throw new Error('Unexpected date format.');
    const [, month, day, year, hour, minute] = match.map(Number);
    // Some engines write midnight as 24:00 even with hourCycle h23.
    const midnight = hour === 24;
    const base = Date.UTC(year, month - 1, day) + (midnight ? DAY_MS : 0);
    return { ...wallClock(base), hour: midnight ? 0 : hour, minute };
  };
}

// Winter, summer, and both sides of each 2026 change.
const PROBES = [
  '2026-01-15T17:30:00Z', '2026-07-01T03:59:00Z', '2026-03-08T06:59:00Z', '2026-03-08T07:00:00Z',
  '2026-11-01T05:59:00Z', '2026-11-01T06:00:00Z', '2026-11-20T04:30:00Z',
].map((iso) => new Date(iso));

const sameTime = (a: EasternTime, b: EasternTime) => a.year === b.year && a.month === b.month
  && a.day === b.day && a.hour === b.hour && a.minute === b.minute && a.weekday === b.weekday;

/** Use Intl only when it gets every probe right; otherwise compute Eastern time. */
export function selectEasternClock(
  factory: FormatterFactory = (options) => new Intl.DateTimeFormat('en-US', options),
): { clock: EasternClock; source: 'intl' | 'computed' } {
  try {
    const intl = intlEasternClock(factory);
    if (PROBES.every((probe) => sameTime(intl(probe), computedEasternClock(probe)))) {
      return { clock: intl, source: 'intl' };
    }
  } catch {
    // No time-zone support, or a format we can't read.
  }
  return { clock: computedEasternClock, source: 'computed' };
}

function clockTime({ hour, minute }: EasternTime): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

const dayNumber = ({ year, month, day }: EasternTime) => Date.UTC(year, month - 1, day) / DAY_MS;

export type EventSection<T> = { key: string; title: string; data: T[] };

export function createEasternFormat(clock: EasternClock) {
  const at = (iso: string) => clock(new Date(iso));
  const shortDate = (t: EasternTime) => `${WEEKDAYS[t.weekday].slice(0, 3)}, ${MONTHS[t.month - 1]} ${t.day}`;

  /** "12:30 PM", for a time column whose header says ET. */
  const time = (iso: string) => clockTime(at(iso));

  /** "Today", "Tomorrow", or "Saturday, Nov 21", in campus time. */
  function dayLabel(iso: string, now: Date): string {
    const target = at(iso);
    const difference = dayNumber(target) - dayNumber(clock(now));
    if (difference === 0) return 'Today';
    if (difference === 1) return 'Tomorrow';
    return `${WEEKDAYS[target.weekday]}, ${MONTHS[target.month - 1]} ${target.day}`;
  }

  /** "Today, 12:30 PM ET" or "Saturday, Nov 21, 9:00 AM ET": the label for a start time in lists. */
  const when = (iso: string, now: Date) => `${dayLabel(iso, now)}, ${time(iso)} ET`;

  /** "Thu, Nov 19, 12:30 PM ET". */
  const dateTime = (iso: string) => {
    const t = at(iso);
    return `${shortDate(t)}, ${clockTime(t)} ET`;
  };

  /** "Today, 12:30 – 2:00 PM ET", or both ends dated when it crosses midnight. */
  function range(startIso: string, endIso: string, now: Date): string {
    const start = at(startIso);
    const end = at(endIso);
    if (dayNumber(start) !== dayNumber(end)) return `${dateTime(startIso).slice(0, -3)} – ${dateTime(endIso)}`;
    return `${dayLabel(startIso, now)}, ${clockTime(start)} – ${clockTime(end)} ET`;
  }

  /** Events grouped by campus day, in the order given. */
  function sections<T extends Pick<Event, 'startsAt'>>(events: readonly T[], now: Date): EventSection<T>[] {
    const result: EventSection<T>[] = [];
    for (const event of events) {
      const t = at(event.startsAt);
      const key = `${t.year}-${t.month}-${t.day}`;
      const last = result[result.length - 1];
      if (last?.key === key) last.data.push(event);
      else result.push({ key, title: dayLabel(event.startsAt, now), data: [event] });
    }
    return result;
  }

  return { time, when, dayLabel, dateTime, range, sections };
}

export const easternClock = selectEasternClock();
export const et = createEasternFormat(easternClock.clock);

/** "34 / 50", "Full" once registeredCount reaches capacity, or "34 registered" without one. */
export function capacityLabel({ registeredCount, capacity }: Pick<Event, 'registeredCount' | 'capacity'>): string {
  if (capacity === null) return `${registeredCount} registered`;
  if (registeredCount >= capacity) return 'Full';
  return `${registeredCount} / ${capacity}`;
}
