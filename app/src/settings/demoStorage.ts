import type { KeyValueStorage } from './storage.ts';

type DeviceStorage = KeyValueStorage & {
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: string[]): Promise<void>;
};

// An old registration or upload may finish after reset. Its writes belong to the old session.
export class DemoStorage {
  private device: DeviceStorage;
  private finished = false;
  private queue = Promise.resolve();

  constructor(device: DeviceStorage) { this.device = device; }

  getItem = (key: string) => this.device.getItem(key);
  getAllKeys = () => this.device.getAllKeys();

  private write(action: () => Promise<void>) {
    const pending = this.queue.then(() => this.finished ? undefined : action());
    this.queue = pending.catch(() => {});
    return pending;
  }

  setItem = (key: string, value: string) => this.write(() => this.device.setItem(key, value));
  removeItem = (key: string) => this.write(() => this.device.removeItem(key));

  reset() {
    return this.write(async () => {
      const keys = (await this.getAllKeys()).filter(key => key.startsWith('ksu-go.'));
      if (keys.length) await this.device.multiRemove(keys);
      this.finished = true;
    });
  }
}
