export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const SERVER_URL_KEY = 'ksu-go.server-url';
const DEVICE_ID_KEY = 'ksu-go.device-id';

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

function createDeviceId(): string {
  return `ksu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export async function getOrCreateDeviceId(
  storage: KeyValueStorage,
  idFactory: () => string = createDeviceId,
): Promise<string> {
  const existing = await storage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const created = idFactory();
  await storage.setItem(DEVICE_ID_KEY, created);
  return created;
}
