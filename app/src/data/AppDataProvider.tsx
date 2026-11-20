import { useDemoSession } from '../settings/DemoSession';
import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import type { EventSeed, Route } from '../../../shared/types.ts';
import campusEvents from '../../../shared/fixtures/events.seed.json';
import routeSample from '../../../shared/fixtures/route.sample.json';
import routeDraft from '../../../shared/fixtures/route.draft-flawed.json';
import { bundledRoutes } from './bundledRoutes';
import { createApiClient } from '../api/client.ts';
import { eventsInRange, loadFixtureEvents } from './events.ts';
import { findFixtureRoute } from './routes.ts';
import { AppDataContext } from './AppDataContext.ts';
import { AppDataController } from './controller.ts';
import { loadServerUrlOverride, saveServerUrlOverride } from '../settings/storage.ts';

const fixtureSeeds = campusEvents as unknown as EventSeed[];
const fixtureRoutes = [...bundledRoutes, routeSample, routeDraft] as unknown as Route[];

/** Device-wide server data: the server address, health, and the open event and route endpoints. */
export function AppDataProvider({ children }: PropsWithChildren) {
  const { storage } = useDemoSession();
  const controller = useMemo(
    () => new AppDataController({
      defaultApiUrl: process.env.EXPO_PUBLIC_API_URL,
      loadServerUrlOverride: () => loadServerUrlOverride(storage),
      saveServerUrlOverride: (url) => saveServerUrlOverride(storage, url),
      fixtureEvents: (now) => loadFixtureEvents(fixtureSeeds, now, 'week'),
      fixtureRoute: (id) => findFixtureRoute(fixtureRoutes, id),
      clientFactory: (url) => createApiClient(url),
    }),
    [storage],
  );
  const [state, setState] = useState(controller.state);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    void controller.start();
    return () => {
      unsubscribe();
      controller.stop();
    };
  }, [controller]);

  const events = useMemo(() => eventsInRange(state.events, state.now, 'today'), [state.events, state.now]);
  const refresh = useCallback(() => controller.refresh(), [controller]);
  const setServerUrl = useCallback((url: string) => controller.setServerUrl(url), [controller]);
  const getRoute = useCallback((id: string) => controller.getRoute(id), [controller]);
  const setRegisteredCount = useCallback(
    (eventId: string, count: number) => controller.setRegisteredCount(eventId, count), [controller],
  );
  const markOffline = useCallback(() => controller.markOffline(), [controller]);

  const value = useMemo(
    () => ({
      ...state, events, weekEvents: state.events, refresh, setServerUrl, getRoute, setRegisteredCount, markOffline,
    }),
    [events, getRoute, markOffline, refresh, setRegisteredCount, setServerUrl, state],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
