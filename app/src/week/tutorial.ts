import type { KeyValueStorage } from '../settings/storage.ts';

export const DISCOVER_HINT_KEY = 'ksu-go.discover-swipe-taught';
export async function needsDiscoverHint(storage: KeyValueStorage): Promise<boolean> {
  return await storage.getItem(DISCOVER_HINT_KEY) !== '1';
}
export function rememberDiscoverSwipe(storage: KeyValueStorage): Promise<void> {
  return storage.setItem(DISCOVER_HINT_KEY, '1');
}
