import type { Event, EventSeed } from '../../../shared/types.ts';

export type EventRange = 'today' | 'week';
export type EventFlagState = 'live' | 'soon' | 'later' | 'ended';

const MINUTE_MS = 60_000;

export function loadFixtureEvents(seed: EventSeed[], now: Date, range: EventRange): Event[] {
  const events = seed.map((event): Event => {
    const startsAt = new Date(now.getTime() + event.startsInMin * MINUTE_MS);
    const endsAt = new Date(startsAt.getTime() + event.durationMin * MINUTE_MS);
    const { startsInMin: _startsInMin, durationMin: _durationMin, ...details } = event;
    return { ...details, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
  });
  return eventsInRange(events, now, range);
}

export function eventsInRange(events: Event[], now: Date, range: EventRange): Event[] {
  const startLimit = now.getTime() + (range === 'today' ? 24 : 7 * 24) * 60 * MINUTE_MS;
  return events
    .filter((event) => event.status !== 'cancelled' && Date.parse(event.endsAt) > now.getTime() && Date.parse(event.startsAt) < startLimit)
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
}

export function getEventFlagState(event: Event, now: Date): EventFlagState {
  if (event.status === 'cancelled') return 'ended';
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  const current = now.getTime();

  if (start <= current && current < end) return 'live';
  if (current >= end) return 'ended';
  if (start - current <= 60 * MINUTE_MS) return 'soon';
  return 'later';
}
