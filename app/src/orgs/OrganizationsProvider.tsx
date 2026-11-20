import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import organizationsJson from '../../../shared/fixtures/organizations.json';
import type { Organization, OrganizationSeed } from '../../../shared/types.ts';
import { createApiClient } from '../api/client.ts';
import { useAppData } from '../data/AppDataContext';
import { fixtureOrganizations } from './organizations.ts';

type OrganizationsValue = {
  organizations: Organization[];
  organization(id: string | null | undefined): Organization | null;
  /** Put a fresh copy from the server (after creating, editing or following). */
  upsert(organization: Organization): void;
  refresh(): Promise<void>;
};

const Context = createContext<OrganizationsValue | null>(null);
const bundled = fixtureOrganizations(organizationsJson as OrganizationSeed[]);

/** Organizations from the server when it answers, the bundled seed file otherwise. */
export function OrganizationsProvider({ children }: PropsWithChildren) {
  const { serverUrl, offline } = useAppData();
  const [organizations, setOrganizations] = useState<Organization[]>(bundled);

  const refresh = useCallback(async () => {
    if (!serverUrl || offline) {
      setOrganizations(bundled);
      return;
    }
    try {
      setOrganizations(await createApiClient(serverUrl).listOrganizations());
    } catch {
      // Keep the last list.
    }
  }, [offline, serverUrl]);
  useEffect(() => { void refresh(); }, [refresh]);

  const upsert = useCallback((organization: Organization) => {
    setOrganizations((list) => {
      const rest = list.filter((item) => item.id !== organization.id);
      return [...rest, organization].sort((a, b) => a.name.localeCompare(b.name));
    });
  }, []);

  const value = useMemo(() => ({
    organizations,
    organization: (id: string | null | undefined) => organizations.find((item) => item.id === id) ?? null,
    upsert, refresh,
  }), [organizations, refresh, upsert]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOrganizations(): OrganizationsValue {
  const value = useContext(Context);
  if (!value) throw new Error('useOrganizations must be used inside OrganizationsProvider.');
  return value;
}
