import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import type { MyRegistration } from '../../../shared/types.ts';
import { createApiClient, type ApiClient } from '../api/client.ts';
import { useAuth } from '../auth/AuthProvider';
import { useAppData } from '../data/AppDataContext';
import { accountIdFor } from '../navigation/access.ts';
import { useDemoSession } from '../settings/DemoSession';
import { scopedStorage, type ScopableStorage } from '../settings/scopedStorage.ts';
import { loadRegisteredEventIds, saveRegisteredEventIds } from '../settings/storage.ts';
import { WeekChoices } from '../week/choices.ts';
import { registerForEvent } from './register.ts';

type AccountValue = {
  /** The signed-in user's id, "guest", or null while signed out. */
  accountId: string | null;
  storage: ScopableStorage;
  weekChoices: WeekChoices;
  registeredEventIds: string[];
  registrationsReady: boolean;
  /** This account's registrations from the server, cancelled and ended included; null until loaded. */
  registrations: MyRegistration[] | null;
  refreshRegistrations(): Promise<void>;
  /** Registers the signed-in user; throws an Error worded for the event card. */
  register(eventId: string): Promise<void>;
  /** A client that sends this account's token, or null without a server address. */
  api: ApiClient | null;
};

const Context = createContext<AccountValue | null>(null);

/** Per-account local data. Every key lives under ksu-go.account.<id>. */
export function AccountProvider({ children }: PropsWithChildren) {
  const { storage: device } = useDemoSession();
  const { state, controller } = useAuth();
  const { serverUrl, offline, setRegisteredCount, markOffline } = useAppData();
  const accountId = accountIdFor(state);
  // Nothing reads or writes while signed out; the scope only keeps the types simple.
  const scope = accountId ?? 'signed-out';

  const storage = useMemo(() => scopedStorage(device, scope), [device, scope]);
  const weekChoices = useMemo(() => new WeekChoices(storage), [storage]);
  const api = useMemo(
    () => serverUrl ? createApiClient(serverUrl, fetch, undefined, undefined, controller.apiAuth) : null,
    [controller, serverUrl],
  );

  const [registered, setRegistered] = useState<{ scope: string; ids: string[] } | null>(null);
  useEffect(() => {
    let active = true;
    void loadRegisteredEventIds(storage).catch(() => [] as string[]).then((ids) => {
      if (active) setRegistered({ scope, ids });
    });
    return () => { active = false; };
  }, [scope, storage]);
  const ready = registered?.scope === scope;
  const registeredEventIds = useMemo(() => ready ? registered.ids : [], [ready, registered]);

  // The server's record replaces the phone's; the phone keeps the ids for offline use.
  const [registrations, setRegistrations] = useState<{ scope: string; list: MyRegistration[] } | null>(null);
  const verified = state.status === 'signedIn' && state.verified;
  const refreshRegistrations = useCallback(async () => {
    if (!api || !verified || offline) return;
    try {
      const list = await api.myRegistrations();
      setRegistrations({ scope, list });
      const ids = list.map((registration) => registration.event.id);
      setRegistered({ scope, ids });
      await saveRegisteredEventIds(storage, ids).catch(() => {});
    } catch {
      // Keep what we have; a 401 is handled by the client and signs out.
    }
  }, [api, offline, scope, storage, verified]);
  useEffect(() => { void refreshRegistrations(); }, [refreshRegistrations]);

  const register = useCallback(async (eventId: string) => {
    const ids = await registerForEvent({
      eventId, state, offline, api,
      registeredIds: ready ? registeredEventIds : null,
      onCount: setRegisteredCount,
      markOffline,
      save: (next) => saveRegisteredEventIds(storage, next),
    });
    setRegistered({ scope, ids });
    void refreshRegistrations();
  }, [api, markOffline, offline, ready, refreshRegistrations, registeredEventIds, scope, setRegisteredCount, state, storage]);

  const value = useMemo(() => ({
    accountId, storage, weekChoices, registeredEventIds, registrationsReady: ready, register, api,
    registrations: registrations?.scope === scope ? registrations.list : null, refreshRegistrations,
  }), [accountId, api, ready, refreshRegistrations, register, registeredEventIds, registrations, scope, storage, weekChoices]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAccount(): AccountValue {
  const value = useContext(Context);
  if (!value) throw new Error('useAccount must be used inside AccountProvider.');
  return value;
}
