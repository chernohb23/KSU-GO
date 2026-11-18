import type { Route } from '../../../shared/types.ts';

export function findFixtureRoute(routes: Route[], id: string): Route | null {
  return routes.find((route) => route.id === id) ?? null;
}
