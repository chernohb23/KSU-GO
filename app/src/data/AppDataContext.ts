import { createContext, useContext } from 'react';

import type { AppDataState } from './controller.ts';
import type { Event, Route } from '../../../shared/types.ts';

export type AppDataContextValue = AppDataState & {
  /** Events starting in the next 7 days; `events` is the 24-hour subset the map shows. */
  weekEvents: Event[];
  setRegisteredCount(eventId: string, registeredCount: number): void;
  markOffline(): void;
  refresh(): Promise<void>;
  setServerUrl(url: string): Promise<void>;
  getRoute(id: string): Promise<Route | null>;
};

export const AppDataContext = createContext<AppDataContextValue | null>(null);

export function useAppData(): AppDataContextValue {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider.');
  return value;
}
