// Who sees what. The layouts use these values for Stack.Protected and
// Tabs.Protected, so the tests check the same rules the navigator applies.

import type { User } from '../../../shared/types.ts';

export type AuthState =
  | { status: 'restoring' }
  | { status: 'signedOut'; message: string | null }
  | { status: 'guest' }
  | { status: 'signedIn'; token: string; user: User; verified: boolean };

export type TabName = 'index' | 'events' | 'organizer' | 'profile';

/** Sign-in screens are reachable; the app screens are not. */
export const showsSignIn = (state: AuthState) => state.status === 'restoring' || state.status === 'signedOut';

export const isOrganizer = (state: AuthState) => state.status === 'signedIn' && state.user.role === 'organizer';

export function tabsFor(state: AuthState): TabName[] {
  if (showsSignIn(state)) return [];
  return isOrganizer(state) ? ['index', 'events', 'organizer', 'profile'] : ['index', 'events', 'profile'];
}

/** The account whose local data is in use, or null while signed out. */
export function accountIdFor(state: AuthState): string | null {
  if (state.status === 'signedIn') return state.user.id;
  if (state.status === 'guest') return 'guest';
  return null;
}

export type RegisterAvailability = 'sign-in' | 'needs-server' | 'registered' | 'available';

/** Registering needs an account and a live server; it is never blocked by capacity. */
export function registerAvailability(input: {
  state: AuthState; offline: boolean; registered: boolean;
}): RegisterAvailability {
  if (input.state.status !== 'signedIn') return 'sign-in';
  if (input.registered) return 'registered';
  if (input.offline || !input.state.verified) return 'needs-server';
  return 'available';
}

/** The map's details sheet hides while another screen (the route) covers the map. */
export const mapSheetVisible = (input: { selected: boolean; listOpen: boolean; focused: boolean }) =>
  input.focused && (input.selected || input.listOpen);
