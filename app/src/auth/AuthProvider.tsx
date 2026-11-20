import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type PropsWithChildren } from 'react';

import { createApiClient } from '../api/client.ts';
import { useAppData } from '../data/AppDataContext';
import { useDemoSession } from '../settings/DemoSession';
import { AuthController, type AuthState } from './controller.ts';

type AuthValue = { controller: AuthController; state: AuthState };
const Context = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const { storage } = useDemoSession();
  const { serverUrl, offline } = useAppData();
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const controller = useMemo(() => new AuthController({
    storage,
    serverUrl: () => serverUrlRef.current,
    clientFactory: (url, auth) => createApiClient(url, fetch, undefined, undefined, auth),
  }), [storage]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);

  useEffect(() => { void controller.restore(); }, [controller]);

  // Check the token whenever the server answers: at launch, after an outage, and on a new address.
  const signedIn = state.status === 'signedIn';
  useEffect(() => {
    if (signedIn && !offline) void controller.recheck();
  }, [controller, offline, serverUrl, signedIn]);

  const value = useMemo(() => ({ controller, state }), [controller, state]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(Context);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
