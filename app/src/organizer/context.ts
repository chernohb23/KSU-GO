import { createContext, useContext, useSyncExternalStore } from 'react';
import type { OrganizerSession } from './session';

export const OrganizerContext = createContext<{ session: OrganizerSession; turnOff(): void } | null>(null);

export function useOrganizer() {
  const context = useContext(OrganizerContext);
  if (!context) throw new Error('Open the Organizer tab to view route drafts.');
  const { session } = context;
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  return { ...context, ...state };
}
