export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const SERVER_URL_KEY = 'ksu-go.server-url';
// Stored through scopedStorage, so each account keeps its own record.
const REGISTERED_EVENT_IDS_KEY = 'ksu-go.registered-event-ids';

/** Phase D replaces the legacy phone record with the server's /me/registrations. */
export function discardLegacyRegistrations(storage: KeyValueStorage): Promise<void> {
  return storage.removeItem(REGISTERED_EVENT_IDS_KEY);
}

export function normalizeServerUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveServerUrl(override: string | null, defaultApiUrl: string | undefined): string | null {
  return normalizeServerUrl(override) ?? normalizeServerUrl(defaultApiUrl);
}

export async function loadServerUrlOverride(storage: KeyValueStorage): Promise<string | null> {
  return normalizeServerUrl(await storage.getItem(SERVER_URL_KEY));
}

export async function saveServerUrlOverride(storage: KeyValueStorage, value: string): Promise<void> {
  const normalized = normalizeServerUrl(value);
  if (normalized) {
    await storage.setItem(SERVER_URL_KEY, normalized);
  } else {
    await storage.removeItem(SERVER_URL_KEY);
  }
}

export async function loadRegisteredEventIds(storage: KeyValueStorage): Promise<string[]> {
  const serialized = await storage.getItem(REGISTERED_EVENT_IDS_KEY);
  if (!serialized) return [];
  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
  } catch {
    return [];
  }
}

export async function saveRegisteredEventIds(storage: KeyValueStorage, eventIds: string[]): Promise<void> {
  await storage.setItem(REGISTERED_EVENT_IDS_KEY, JSON.stringify([...new Set(eventIds)]));
}
