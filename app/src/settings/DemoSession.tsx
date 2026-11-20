import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { DemoStorage } from './demoStorage';

type Session = { storage: DemoStorage; resetDemo(): Promise<void> };
const Context = createContext<Session | null>(null);

/** Device storage, and Reset demo: clears every ksu-go.* key and remounts the app below. */
export function DemoSessionProvider({ children }: PropsWithChildren) {
  const [generation, setGeneration] = useState(0);
  const session = useMemo((): Session => {
    const storage = new DemoStorage(AsyncStorage);
    return {
      storage,
      async resetDemo() {
        await storage.reset();
        setGeneration(generation + 1);
      },
    };
  }, [generation]);
  return <Context.Provider key={generation} value={session}>{children}</Context.Provider>;
}

export function useDemoSession(): Session {
  const session = useContext(Context);
  if (!session) throw new Error('Demo session is missing.');
  return session;
}
