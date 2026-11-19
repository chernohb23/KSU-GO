import type { Route } from '../../../shared/types.ts';
import { ApiRequestError, type ApiClient, type UploadRouteInput } from '../api/client.ts';

export const ROUTE_POLL_MS = 3_000;
const UPLOAD_KEY_PREFIX = 'ksu-go.uploaded-route.';

type RouteApi = Pick<ApiClient, 'uploadRoute' | 'getRoute'>;
type DeviceStorage = {
  getAllKeys(): Promise<readonly string[]>;
  setItem(key: string, value: string): Promise<void>;
};

type Transfer =
  | { phase: 'uploading'; input: UploadRouteInput; percent: number }
  | { phase: 'error'; input: UploadRouteInput; message: string }
  | { phase: 'accepted'; routeId: string };

type SessionState = {
  routes: Record<string, Route>;
  readErrors: Record<string, string>;
  transfer: Transfer | null;
  storageNotice: string | null;
  loaded: boolean;
};

function uploadError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'budget_exceeded') return 'The processing budget has been reached. You can still open an existing draft.';
    if (error.code === 'video_rejected') return `The server rejected this video. ${error.message}`;
    return error.message;
  }
  return 'The upload was interrupted. Check the server connection and retry.';
}

// The transfer belongs to the Organizer tab, so navigating to another draft never cancels it.
export class OrganizerSession {
  private api: RouteApi | null;
  private readonly storage: DeviceStorage;
  private readonly fixtures: Record<string, Route>;
  private readonly ids: Set<string>;
  private readonly unsavedIds = new Set<string>();
  private readonly reads = new Map<string, Promise<void>>();
  private readonly listeners = new Set<() => void>();
  private current: SessionState;

  constructor(api: RouteApi | null, storage: DeviceStorage, fixtures: readonly Route[]) {
    this.api = api;
    this.storage = storage;
    this.fixtures = Object.fromEntries(fixtures.map((route) => [route.id, route]));
    this.ids = new Set(Object.keys(this.fixtures));
    this.current = { routes: api ? {} : this.fixtures, readErrors: {}, transfer: null, storageNotice: null, loaded: false };
  }

  get state(): SessionState { return this.current; }
  snapshot = (): SessionState => this.current;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(change: Partial<SessionState>) {
    this.current = { ...this.current, ...change };
    for (const listener of this.listeners) listener();
  }

  setApi(api: RouteApi | null) {
    if (api === this.api) return;
    this.api = api;
    this.reads.clear();
    this.update({ routes: api ? {} : this.fixtures, readErrors: {}, loaded: false });
  }

  async refresh(): Promise<void> {
    await Promise.all([...this.unsavedIds].map((id) => this.remember(id)));
    try {
      for (const key of await this.storage.getAllKeys()) {
        if (key.startsWith(UPLOAD_KEY_PREFIX)) this.ids.add(key.slice(UPLOAD_KEY_PREFIX.length));
      }
      if (!this.unsavedIds.size && this.current.storageNotice) this.update({ storageNotice: null });
    } catch {
      this.update({ storageNotice: 'Could not read the uploads saved on this device.' });
    }
    await Promise.all([...this.ids].map((id) => this.read(id)));
    this.update({ loaded: true });
  }

  async poll(): Promise<void> {
    const pending = [...this.ids].filter((id) => this.current.routes[id]?.status === 'processing' || this.current.readErrors[id]);
    await Promise.all(pending.map((id) => this.read(id)));
  }

  read(id: string): Promise<void> {
    this.ids.add(id);
    if (!this.api) return Promise.resolve();
    const existing = this.reads.get(id);
    if (existing) return existing;
    const request = this.readRoute(this.api, id).finally(() => {
      if (this.reads.get(id) === request) this.reads.delete(id);
    });
    this.reads.set(id, request);
    return request;
  }

  private async readRoute(api: RouteApi, id: string): Promise<void> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8_000);
    try {
      const route = await api.getRoute(id, abort.signal);
      if (api !== this.api) return;
      const readErrors = { ...this.current.readErrors };
      delete readErrors[id];
      this.update({ routes: { ...this.current.routes, [id]: route }, readErrors });
    } catch (error) {
      if (api !== this.api) return;
      const routes = { ...this.current.routes };
      const readErrors = { ...this.current.readErrors };
      if (error instanceof ApiRequestError && error.status === 404) {
        delete routes[id];
        delete readErrors[id];
      } else {
        if (!routes[id] && this.fixtures[id]) routes[id] = this.fixtures[id];
        readErrors[id] = 'Could not refresh this route. Checking again when the server responds.';
      }
      this.update({ routes, readErrors });
    } finally {
      clearTimeout(timeout);
    }
  }

  clearTransfer() {
    if (this.current.transfer?.phase !== 'uploading') this.update({ transfer: null });
  }

  async upload(input: UploadRouteInput): Promise<void> {
    if (this.current.transfer?.phase === 'uploading') return;
    const api = this.api;
    if (!api) {
      this.update({ transfer: { phase: 'error', input, message: 'Set a server address in Server settings to upload a video.' } });
      return;
    }
    this.update({ transfer: { phase: 'uploading', input, percent: 0 } });
    let route: Route;
    try {
      route = await api.uploadRoute(input, (percent) => {
        this.update({ transfer: { phase: 'uploading', input, percent } });
      });
    } catch (error) {
      this.update({ transfer: { phase: 'error', input, message: uploadError(error) } });
      return;
    }

    this.ids.add(route.id);
    const routes = api === this.api ? { ...this.current.routes, [route.id]: route } : this.current.routes;
    this.update({ routes, transfer: { phase: 'accepted', routeId: route.id } });
    if (api !== this.api) void this.read(route.id);
    await this.remember(route.id);
  }

  private async remember(id: string): Promise<void> {
    this.unsavedIds.add(id);
    try {
      // One key per accepted route makes independent uploads safe to save in any order.
      await this.storage.setItem(UPLOAD_KEY_PREFIX + id, '1');
      this.unsavedIds.delete(id);
    } catch {
      if (this.unsavedIds.has(id)) {
        this.update({ storageNotice: 'The server accepted the video. Saving its route ID will retry when you reopen drafts.' });
      }
    }
  }
}
