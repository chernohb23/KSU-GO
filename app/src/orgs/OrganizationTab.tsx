import { createContext, useContext } from 'react';

/** The Organization tab's selected organization, when the user owns several. */
export const OrganizationTabContext = createContext<{ organizationId: string | null; select(id: string): void } | null>(null);

export function useOrganizationTab() {
  const value = useContext(OrganizationTabContext);
  if (!value) throw new Error('Open the Organization tab.');
  return value;
}

export const SELECTED_ORGANIZATION_KEY = 'ksu-go.selected-organization';
