import { createContext, useContext, useSyncExternalStore } from 'react';
import type { OrganizerSession } from './session';

export const OrganizerContext = createContext<{ session: OrganizerSession } | null>(null);

export function useOrganizer() {
  const context = useContext(OrganizerContext);
  if (!context) throw new Error('Open the event’s Directions in the Organization tab.');
  const { session } = context;
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  return { ...context, ...state };
}
