import type { Organization, OrganizationSeed } from '../../../shared/types.ts';

/** The bundled seed organizations, shown with 0 followers until the server answers. */
export function fixtureOrganizations(seeds: readonly OrganizationSeed[]): Organization[] {
  return seeds.map((seed) => ({ ...seed, followerCount: 0 })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The organizations a user owns, in the order the server lists them. */
export function ownedOrganizations(organizations: readonly Organization[], ownedIds: readonly string[]): Organization[] {
  return ownedIds.map((id) => organizations.find((organization) => organization.id === id))
    .filter((organization): organization is Organization => organization !== undefined);
}

/** "https://ksu-go.example/robotics" → "ksu-go.example/robotics". */
export const displayUrl = (url: string) => url.replace(/^https:\/\//, '').replace(/\/$/, '');
