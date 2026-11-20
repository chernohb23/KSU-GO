// Profile figures from real data: registrations from the server, saves from this phone,
// follows from the user (CONTRACTS.md section 5).

import type { Event, MyRegistration } from '../../../shared/types.ts';
import { easternClock, et, type EasternClock } from '../events/format.ts';

export type Insights = { registeredThisMonth: number; upcoming: number; saved: number; following: number };

export function insights(input: {
  registrations: readonly MyRegistration[]; savedCount: number; followingCount: number; now: Date;
  clock?: EasternClock;
}): Insights {
  const clock = input.clock ?? easternClock.clock;
  const month = clock(input.now);
  const sameMonth = (iso: string) => {
    const t = clock(new Date(iso));
    return t.year === month.year && t.month === month.month;
  };
  return {
    registeredThisMonth: input.registrations.filter((r) => sameMonth(r.registeredAt)).length,
    upcoming: input.registrations.filter((r) => r.event.status === 'active' && Date.parse(r.event.endsAt) > input.now.getTime()).length,
    saved: input.savedCount,
    following: input.followingCount,
  };
}

/** Registered events that haven't ended, soonest first; cancelled ones stay, labeled. */
export function upcomingRegistrations(registrations: readonly MyRegistration[], now: Date): Event[] {
  return registrations.map((r) => r.event)
    .filter((event) => Date.parse(event.endsAt) > now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** "Happening now", "Starts in 25 min", "Starts in 2 h 15 min", then "Tomorrow, 6:00 PM ET". */
export function countdown(event: Pick<Event, 'startsAt' | 'endsAt' | 'status'>, now: Date): string {
  if (event.status === 'cancelled') return 'Cancelled';
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  const t = now.getTime();
  if (start <= t && t < end) return 'Happening now';
  const minutes = Math.ceil((start - t) / 60_000);
  if (minutes < 60) return `Starts in ${Math.max(1, minutes)} min`;
  if (minutes < 12 * 60) {
    const rest = minutes % 60;
    return rest ? `Starts in ${Math.floor(minutes / 60)} h ${rest} min` : `Starts in ${minutes / 60} h`;
  }
  return et.when(event.startsAt, now);
}

const CATEGORY_LABELS: Record<Event['category'], string> = {
  academic: 'Academic', social: 'Social', career: 'Career', sports: 'Sports', arts: 'Arts', other: 'Other',
};

export const categoryLabel = (category: Event['category']) => CATEGORY_LABELS[category];

/** The three categories you save and register for most, most first. Ties keep the category order. */
export function interests(categories: readonly Event['category'][]): Event['category'][] {
  const counts = new Map<Event['category'], number>();
  for (const category of categories) counts.set(category, (counts.get(category) ?? 0) + 1);
  const order = Object.keys(CATEGORY_LABELS) as Event['category'][];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))
    .slice(0, 3).map(([category]) => category);
}
