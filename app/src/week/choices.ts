import type { Event } from '../../../shared/types.ts';
import type { KeyValueStorage } from '../settings/storage.ts';

type SavedDetails = Pick<Event, 'title' | 'startsAt'>;
type Choice = Pick<Event, 'id' | 'organizer' | 'category'> & { saved: SavedDetails | null };
export type Decision = 'save' | 'skip';
const key = 'ksu-go.weekly-event-choices';

export function swipeDecision(distance: number, cardWidth: number, canceled: boolean): Decision | null {
  'worklet';
  if (canceled || Math.abs(distance) <= cardWidth / 2) return null;
  return distance > 0 ? 'save' : 'skip';
}

export function eventChoice(event: Event, decision: Decision): Choice {
  const { id, category, organizer, title, startsAt } = event;
  return { id, category, organizer, saved: decision === 'save' ? { title, startsAt } : null };
}

export function rankDeck(events: Event[], choices: readonly Choice[]): Event[] {
  const categories = new Map<string, number>();
  const organizers = new Map<string, number>();
  const seen = new Set<string>();
  for (const { id, category, organizer, saved } of choices) {
    seen.add(id);
    const weight = saved ? 1 : -1;
    categories.set(category, (categories.get(category) ?? 0) + weight);
    organizers.set(organizer, (organizers.get(organizer) ?? 0) + weight);
  }
  const score = (event: Event) => (categories.get(event.category) ?? 0) + (organizers.get(event.organizer) ?? 0);
  return events.filter(event => !seen.has(event.id))
    .sort((a, b) => score(b) - score(a) || Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

function isChoice(value: unknown): value is Choice {
  if (typeof value !== 'object' || value === null) return false;
  const choice = value as Partial<Choice>;
  return typeof choice.id === 'string' && typeof choice.category === 'string' && typeof choice.organizer === 'string'
    && (choice.saved === null || (typeof choice.saved?.title === 'string' && typeof choice.saved.startsAt === 'string'));
}

// One durable record per decision keeps the saved list, seen cards, and both scores in sync.
export class WeekChoices {
  private choices: Choice[] | null = null;
  private queue = Promise.resolve();
  private listeners = new Set<() => void>();
  private storage: KeyValueStorage;

  constructor(storage: KeyValueStorage) { this.storage = storage; }

  snapshot = () => this.choices;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(choices: Choice[]) {
    this.choices = choices;
    for (const listener of this.listeners) listener();
  }

  private enqueue(work: () => Promise<void>) {
    const pending = this.queue.then(work);
    this.queue = pending.catch(() => {});
    return pending;
  }

  private async hydrate() {
    if (this.choices !== null) return this.choices;
    const raw = await this.storage.getItem(key);
    let parsed: unknown;
    try { parsed = raw && JSON.parse(raw); } catch { parsed = null; }
    const choices = Array.isArray(parsed) ? parsed.filter(isChoice) : [];
    this.publish(choices);
    return choices;
  }

  load = () => this.enqueue(() => this.hydrate().then(() => {}));

  private change(update: (choices: Choice[]) => Choice[]) {
    return this.enqueue(async () => {
      const previous = await this.hydrate();
      const next = update(previous);
      if (next === previous) return;
      if (next.length) await this.storage.setItem(key, JSON.stringify(next));
      else await this.storage.removeItem(key);
      this.publish(next);
    });
  }

  choose(event: Event, decision: Decision) {
    return this.change(choices => choices.some(choice => choice.id === event.id)
      ? choices : [...choices, eventChoice(event, decision)]);
  }

  /** Explicit saving also works for an event previously skipped in Discover. */
  setSaved(event: Event, saved: boolean) {
    return this.change(choices => {
      const previous = choices.find(choice => choice.id === event.id);
      if (!saved) return previous?.saved ? choices.filter(choice => choice.id !== event.id) : choices;
      if (previous?.saved) return choices;
      const next = eventChoice(event, 'save');
      return previous ? choices.map(choice => choice.id === event.id ? next : choice) : [...choices, next];
    });
  }

  remove(id: string) { return this.change(choices => choices.filter(choice => choice.id !== id)); }
  reset = () => this.change(() => []);
}
