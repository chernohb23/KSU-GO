// The sign-in state machine (CONTRACTS.md section 5, "Accounts" and "Offline").
//
//   restoring ─ no saved session ───────────▶ signedOut
//   restoring ─ saved session ──────────────▶ signedIn (unverified: read-only until checked)
//   signedIn ─ recheck, /me 200 ────────────▶ signedIn (verified)
//   signedIn ─ recheck, /me 401 ────────────▶ signedOut ("Your session ended…")
//   signedIn ─ recheck, unreachable ────────▶ stays unverified (read-only, Offline badge)
//
// The provider calls recheck whenever the server is reachable, so launch,
// coming back online and a new server address all check the token.
//   signedOut ─ login / signup ─────────────▶ signedIn (verified)
//   signedOut ─ browse offline ─────────────▶ guest ─ leaveGuest ─▶ signedOut
//   signedIn ─ signOut ─────────────────────▶ signedOut (only the session key is cleared)
//   signedIn ─ 401 for the current token ───▶ signedOut ("Your session ended…")

import type { AuthResponse, User } from '../../../shared/types.ts';
import { ApiRequestError, type ApiAuth, type ApiClient } from '../api/client.ts';
import type { AuthState } from '../navigation/access.ts';
import type { KeyValueStorage } from '../settings/storage.ts';

export type { AuthState };
export const SESSION_KEY = 'ksu-go.session';
export const SESSION_ENDED = 'Your session ended. Sign in again.';
export const NO_SERVER = 'No server address is set. Long-press KSU-GO to add one, or browse offline.';
export const UNREACHABLE = "Can't reach the server. Long-press KSU-GO to check the server address, or browse offline.";
export const ME_TIMEOUT_MS = 4_000;
export const SIGN_IN_TIMEOUT_MS = 10_000;

type AuthApi = Pick<ApiClient, 'login' | 'signup' | 'logout' | 'me'>;

export type AuthControllerOptions = {
  storage: KeyValueStorage;
  serverUrl: () => string | null;
  clientFactory: (url: string, auth?: ApiAuth) => AuthApi;
  meTimeoutMs?: number;
  signInTimeoutMs?: number;
};

/** A sign-in or sign-up failure, worded for the form. */
export class AuthFormError extends Error {}

type SavedSession = { token: string; user: User };

function parseSession(raw: string | null): SavedSession | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { token, user } = value as Partial<SavedSession>;
    if (typeof token !== 'string' || typeof user !== 'object' || user === null) return null;
    if (typeof user.id !== 'string' || typeof user.name !== 'string' || typeof user.email !== 'string') return null;
    if (user.role !== 'student' && user.role !== 'organizer') return null;
    return { token, user: { ...user, organizationId: user.organizationId ?? null } };
  } catch {
    return null;
  }
}

function sameUser(a: User, b: User): boolean {
  return a.id === b.id && a.name === b.name && a.email === b.email && a.role === b.role
    && a.organizationId === b.organizationId;
}

async function withTimeout<T>(request: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, ms);
  });
  try {
    return await Promise.race([request(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class AuthController {
  private readonly options: AuthControllerOptions;
  private readonly listeners = new Set<(state: AuthState) => void>();
  private current: AuthState = { status: 'restoring' };
  // Bumped on every transition, so a late answer can't overwrite a newer state.
  private epoch = 0;

  constructor(options: AuthControllerOptions) {
    this.options = options;
  }

  get state(): AuthState { return this.current; }
  snapshot = (): AuthState => this.current;
  subscribe = (listener: (state: AuthState) => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** The current token, for the API client's Authorization header. */
  token = (): string | null => this.current.status === 'signedIn' ? this.current.token : null;

  /** Auth hooks for API clients: send the current token, and expire it on its own 401. */
  readonly apiAuth: ApiAuth = {
    token: () => this.token(),
    onUnauthorized: (sentToken) => this.expire(sentToken),
  };

  private set(state: AuthState) {
    this.epoch += 1;
    this.current = state;
    for (const listener of this.listeners) listener(state);
  }

  async restore(): Promise<void> {
    const epoch = this.epoch;
    let saved: SavedSession | null = null;
    try {
      saved = parseSession(await this.options.storage.getItem(SESSION_KEY));
    } catch {
      saved = null;
    }
    if (epoch !== this.epoch) return;
    if (!saved) {
      this.set({ status: 'signedOut', message: null });
      return;
    }
    this.set({ status: 'signedIn', token: saved.token, user: saved.user, verified: false });
  }

  /** Check an unverified session against the server. Unreachable keeps it read-only. */
  async recheck(): Promise<void> {
    const state = this.current;
    const url = this.options.serverUrl();
    if (state.status !== 'signedIn' || !url) return;
    const epoch = this.epoch;
    const client = this.options.clientFactory(url, { token: () => state.token, onUnauthorized: () => {} });
    try {
      const user = await withTimeout((signal) => client.me(signal), this.options.meTimeoutMs ?? ME_TIMEOUT_MS);
      if (epoch !== this.epoch) return;
      // Nothing new: no state change, so navigation isn't re-rendered mid-transition
      // (right after sign-in, the guarded sign-in screen is still redirecting).
      if (state.verified && sameUser(state.user, user)) return;
      this.set({ status: 'signedIn', token: state.token, user, verified: true });
      await this.save({ token: state.token, user });
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (error instanceof ApiRequestError && error.status === 401) {
        await this.endSession(SESSION_ENDED);
      } else if (state.verified) {
        this.set({ ...state, verified: false });
      }
    }
  }

  signIn(email: string, password: string): Promise<void> {
    return this.authenticate((client, signal) => client.login({ email, password }, signal));
  }

  signUp(name: string, email: string, password: string): Promise<void> {
    return this.authenticate((client, signal) => client.signup({ name, email, password }, signal));
  }

  private async authenticate(call: (client: AuthApi, signal: AbortSignal) => Promise<AuthResponse>) {
    const url = this.options.serverUrl();
    if (!url) throw new AuthFormError(NO_SERVER);
    const client = this.options.clientFactory(url);
    let response: AuthResponse;
    try {
      response = await withTimeout((signal) => call(client, signal), this.options.signInTimeoutMs ?? SIGN_IN_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof ApiRequestError) throw new AuthFormError(error.message);
      throw new AuthFormError(UNREACHABLE);
    }
    await this.save(response);
    this.set({ status: 'signedIn', token: response.token, user: response.user, verified: true });
  }

  browseOffline() {
    if (this.current.status === 'signedOut') this.set({ status: 'guest' });
  }

  leaveGuest() {
    if (this.current.status === 'guest') this.set({ status: 'signedOut', message: null });
  }

  /** Sign out on purpose: clear the session first, then tell the server and ignore its answer. */
  async signOut(): Promise<void> {
    const state = this.current;
    if (state.status !== 'signedIn') return;
    await this.endSession(null);
    const url = this.options.serverUrl();
    if (!url) return;
    const client = this.options.clientFactory(url, { token: () => state.token, onUnauthorized: () => {} });
    try {
      await withTimeout((signal) => client.logout(signal), this.options.meTimeoutMs ?? ME_TIMEOUT_MS);
    } catch {
      // Offline or already expired: the local session is gone either way.
    }
  }

  /** A 401 came back for `sentToken`. Only the current token ends the session. */
  expire(sentToken: string) {
    if (this.current.status === 'signedIn' && this.current.token === sentToken) {
      void this.endSession(SESSION_ENDED);
    }
  }

  private async endSession(message: string | null) {
    this.set({ status: 'signedOut', message });
    try {
      await this.options.storage.removeItem(SESSION_KEY);
    } catch {
      // The next launch will find an invalid token and end it again.
    }
  }

  private async save(session: SavedSession) {
    try {
      await this.options.storage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // The session still works until the app restarts.
    }
  }
}
