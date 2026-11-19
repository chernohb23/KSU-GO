import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { WeekChoices } from '../week/choices';
import { DemoStorage } from './demoStorage';

type Session = { storage: DemoStorage; weekChoices: WeekChoices; resetDemo(): Promise<void> };
const Context = createContext<Session | null>(null);

export function DemoSessionProvider({ children }: PropsWithChildren) {
  const [generation, setGeneration] = useState(0);
  const session = useMemo((): Session => {
    const storage = new DemoStorage(AsyncStorage);
    return {
      storage, weekChoices: new WeekChoices(storage),
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
