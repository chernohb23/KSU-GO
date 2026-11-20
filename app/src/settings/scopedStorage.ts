// Per-account storage: `ksu-go.X` is stored as `ksu-go.account.<id>.X`.
// Keys keep the `ksu-go.` prefix, so Reset demo still clears them. The server
// address and the session stay device-wide and use the unscoped storage.

export type ScopableStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
};

const PREFIX = 'ksu-go.';
export const GUEST_ACCOUNT = 'guest';

export function accountPrefix(accountId: string): string {
  return `${PREFIX}account.${accountId}.`;
}

export function scopedStorage(base: ScopableStorage, accountId: string): ScopableStorage {
  const prefix = accountPrefix(accountId);
  const inner = (key: string) => {
    if (!key.startsWith(PREFIX)) throw new Error(`Account storage keys start with "${PREFIX}".`);
    return prefix + key.slice(PREFIX.length);
  };
  return {
    getItem: (key) => base.getItem(inner(key)),
    setItem: (key, value) => base.setItem(inner(key), value),
    removeItem: (key) => base.removeItem(inner(key)),
    getAllKeys: async () => (await base.getAllKeys())
      .filter((key) => key.startsWith(prefix))
      .map((key) => PREFIX + key.slice(prefix.length)),
  };
}
