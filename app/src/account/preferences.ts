import type { Event } from '../../../shared/types.ts';

export const INTERESTS_KEY = 'ksu-go.interests';
export const CATEGORIES: Event['category'][] = ['academic', 'social', 'career', 'sports', 'arts', 'other'];

/** null means use suggestions; [] is an intentional empty selection. */
export function parseInterests(raw: string | null): Event['category'][] | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    return CATEGORIES.filter((category) => value.includes(category));
  } catch { return null; }
}

export function toggleInterest(current: Event['category'][], category: Event['category']): Event['category'][] {
  return current.includes(category) ? current.filter((item) => item !== category) : [...current, category];
}
