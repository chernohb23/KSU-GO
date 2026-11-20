// Values for the create and edit event form, all in campus time (ET).
// The server checks the same rules (CONTRACTS.md section 5, "Creating events");
// these keep the choices inside them so the form rarely gets a refusal.

import type { CreateEventRequest, Event } from '../../../shared/types.ts';
import { computedEasternClock, easternClock, isEasternDaylightTime, type EasternClock } from './format.ts';

export const DURATIONS = [30, 60, 90, 120] as const;
export const SLOT_MIN = 15;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WEEK_MS = 7 * DAY_MS;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type CampusDay = { year: number; month: number; day: number; weekday: number };

const pad = (n: number) => String(n).padStart(2, '0');

/** The instant of an ET wall-clock time, as ISO 8601 with its offset ("-05:00" or "-04:00"). */
export function etToIso({ year, month, day }: CampusDay, hour: number, minute: number): string {
  // Try the standard-time offset first; if that instant is in daylight time, use -04:00.
  const asStandard = new Date(Date.UTC(year, month - 1, day, hour + 5, minute));
  const offset = isEasternDaylightTime(asStandard) || isEasternDaylightTime(new Date(asStandard.getTime() - 60 * MINUTE_MS))
    ? -4 : -5;
  const sign = offset < 0 ? '-' : '+';
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${sign}${pad(Math.abs(offset))}:00`;
}

/** Today and the next six days, in campus time. */
export function nextDays(now: Date, clock: EasternClock = easternClock.clock): CampusDay[] {
  const today = clock(now);
  const days: CampusDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    days.push({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() });
  }
  return days;
}

export function dayChipLabel(day: CampusDay, index: number): { top: string; bottom: string } {
  return { top: index === 0 ? 'Today' : WEEKDAYS[day.weekday], bottom: `${MONTHS[day.month - 1]} ${day.day}` };
}

export type TimeSlot = { hour: number; minute: number; iso: string; label: string };

/** 15-minute start times on that campus day that fall inside now < start < now + 7 days. */
export function timeSlots(day: CampusDay, now: Date): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += SLOT_MIN) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const iso = etToIso(day, hour, minute);
    const t = Date.parse(iso);
    if (t > now.getTime() && t < now.getTime() + WEEK_MS) {
      const twelve = hour % 12 === 0 ? 12 : hour % 12;
      slots.push({ hour, minute, iso, label: `${twelve}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}` });
    }
  }
  return slots;
}

export type EventFormValues = {
  title: string;
  description: string;
  category: Event['category'] | null;
  buildingId: string | null;
  room: string;
  /** null keeps the event's current start (editing). */
  startsAt: string | null;
  durationMin: number;
  capacity: string;
  partnerOrganizationId: string | null;
  tags: string[];
};

/** The first problem the form can see before asking the server, or null. */
export function formProblem(values: EventFormValues, editing: boolean): string | null {
  if (!values.title.trim()) return 'Add a title.';
  if (!values.description.trim()) return 'Add a short description.';
  if (!values.category) return 'Choose a category.';
  if (!values.buildingId) return 'Choose a building.';
  if (!values.room.trim()) return 'Add the room.';
  if (!editing && !values.startsAt) return 'Choose a day and a start time.';
  if (values.capacity.trim() && !/^[1-9]\d*$/.test(values.capacity.trim())) return 'Capacity is a whole number, or leave it empty.';
  return null;
}

/** The request body; `currentStart` is used when an edit keeps the start time. */
export function eventRequestFields(values: EventFormValues, currentStart: string | null) {
  const startsAt = values.startsAt ?? currentStart;
  if (!startsAt || !values.category || !values.buildingId) throw new Error('The form is incomplete.');
  const body: Omit<CreateEventRequest, 'organizationId'> = {
    title: values.title, description: values.description, category: values.category,
    partnerOrganizationId: values.partnerOrganizationId, tags: values.tags, startsAt,
    durationMin: values.durationMin, location: { buildingId: values.buildingId, room: values.room },
    capacity: values.capacity.trim() ? Number(values.capacity.trim()) : null,
  };
  return body;
}

/** Tag chips: trimmed, lowercased, unique, at most 8, each 1 to 24 characters. */
export function addTag(tags: string[], raw: string): string[] {
  const tag = raw.trim().toLowerCase();
  if (!tag || tag.length > 24 || tags.includes(tag) || tags.length >= 8) return tags;
  return [...tags, tag];
}

// Kept for tests that pin the computed path.
export { computedEasternClock };
