import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import type { EventSeed, Route } from '../../../shared/types.ts';
import campusEvents from '../../../shared/fixtures/events.seed.json';
import routeSample from '../../../shared/fixtures/route.sample.json';
import routeDraft from '../../../shared/fixtures/route.draft-flawed.json';
import routePlaceholder from '../../../shared/fixtures/routes/placeholder.draft.json';
import { createApiClient } from '../api/client.ts';
import { loadFixtureEvents } from './events.ts';
import { findFixtureRoute } from './routes.ts';
import { AppDataContext } from './AppDataContext.ts';
import { AppDataController } from './controller.ts';
import { getOrCreateDeviceId, loadServerUrlOverride, saveServerUrlOverride } from '../settings/storage.ts';

const fixtureSeeds = campusEvents as unknown as EventSeed[];
const fixtureRoutes = [routeSample, routeDraft, routePlaceholder] as unknown as Route[];

export function AppDataProvider({ children }: PropsWithChildren) {
  const controller = useMemo(
    () => new AppDataController({
      defaultApiUrl: process.env.EXPO_PUBLIC_API_URL,
      loadServerUrlOverride: () => loadServerUrlOverride(AsyncStorage),
      saveServerUrlOverride: (url) => saveServerUrlOverride(AsyncStorage, url),
      fixtureEvents: (now) => loadFixtureEvents(fixtureSeeds, now, 'today'),
      fixtureRoute: (id) => findFixtureRoute(fixtureRoutes, id),
      clientFactory: (url) => createApiClient(url),
    }),
    [],
  );
  const [state, setState] = useState(controller.state);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = controller.subscribe(setState);
    void controller.start();
    void getOrCreateDeviceId(AsyncStorage).then((id) => {
      if (mounted) setDeviceId(id);
    });
    return () => {
      mounted = false;
      unsubscribe();
      controller.stop();
    };
  }, [controller]);

  const value = useMemo(
    () => ({ ...state, deviceId, refresh: () => controller.refresh(), setServerUrl: (url: string) => controller.setServerUrl(url), getRoute: (id: string) => controller.getRoute(id) }),
    [controller, deviceId, state],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
