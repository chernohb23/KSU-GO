// Registering for an event as the signed-in user (CONTRACTS.md section 5).
// Needs an account and a live server; capacity never blocks it.

import { ApiRequestError, type ApiClient } from '../api/client.ts';
import { registerAvailability, type AuthState } from '../navigation/access.ts';

export const REGISTER_TIMEOUT_MS = 5_000;
export const NEEDS_SERVER = 'Registering needs the server. Try again once the Offline data badge is gone.';
export const NEEDS_SIGN_IN = 'Sign in to register.';

export type RegisterInput = {
  eventId: string;
  state: AuthState;
  offline: boolean;
  /** This account's record; null while it is still loading. */
  registeredIds: readonly string[] | null;
  api: Pick<ApiClient, 'register'> | null;
  /** Show the server's new count. */
  onCount(eventId: string, count: number): void;
  /** The server stopped answering: fall back to fixtures. */
  markOffline(): void;
  save(ids: string[]): Promise<void>;
  timeoutMs?: number;
};

/** Returns the account's updated record. Throws an Error worded for the event card. */
export async function registerForEvent(input: RegisterInput): Promise<string[]> {
  const ids = input.registeredIds ?? [];
  const availability = registerAvailability({ state: input.state, offline: input.offline, registered: ids.includes(input.eventId) });
  if (availability === 'registered') return [...ids];
  if (availability === 'sign-in') throw new Error(NEEDS_SIGN_IN);
  if (availability === 'needs-server' || !input.api || input.registeredIds === null) throw new Error(NEEDS_SERVER);

  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { abort.abort(); reject(new Error('timeout')); }, input.timeoutMs ?? REGISTER_TIMEOUT_MS);
  });
  let count: number;
  try {
    count = (await Promise.race([input.api.register(input.eventId, abort.signal), timeout])).registeredCount;
  } catch (error) {
    if (error instanceof ApiRequestError) throw new Error(error.message);
    input.markOffline();
    throw new Error(NEEDS_SERVER);
  } finally {
    clearTimeout(timer);
  }
  input.onCount(input.eventId, count);
  const next = [...ids, input.eventId];
  await input.save(next).catch(() => {});
  return next;
}
