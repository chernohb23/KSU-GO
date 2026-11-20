import { Redirect, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useAccount } from '../../../src/account/AccountProvider';
import { useAuth } from '../../../src/auth/AuthProvider';
import { DataSourceBadge, headerStyles } from '../../../src/navigation/AppHeader';
import { ownsOrganization } from '../../../src/navigation/access';
import { tone } from '../../../src/navigation/theme';
import { OrganizerContext } from '../../../src/organizer/context';
import { OrganizerSession, ROUTE_POLL_MS } from '../../../src/organizer/session';
import { OrganizationTabContext, SELECTED_ORGANIZATION_KEY } from '../../../src/orgs/OrganizationTab';

export const unstable_settings = { initialRouteName: 'index' };

export default function OrganizationLayout() {
  const { state } = useAuth();
  const { api, storage } = useAccount();
  // Uploads and draft reviews run through OrganizerSession (APP-6b), scoped to this account.
  // No bundled drafts: the server's directions endpoint ties each draft to its event.
  const [initialApi] = useState(api);
  const session = useMemo(() => new OrganizerSession(initialApi, storage, []), [initialApi, storage]);
  const allowed = ownsOrganization(state);
  const owned = state.status === 'signedIn' ? state.user.ownedOrganizationIds : [];

  const [selected, setSelected] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    void storage.getItem(SELECTED_ORGANIZATION_KEY).then((id) => { if (active) setSelected(id); }).catch(() => {});
    return () => { active = false; };
  }, [storage]));
  const organizationId = selected && owned.includes(selected) ? selected : owned[0] ?? null;
  const select = useCallback((id: string) => {
    setSelected(id);
    void storage.setItem(SELECTED_ORGANIZATION_KEY, id).catch(() => {});
  }, [storage]);

  useEffect(() => { session.setApi(api); }, [api, session]);
  useFocusEffect(useCallback(() => {
    if (!allowed) return;
    const timer = setInterval(() => { void session.poll(); }, ROUTE_POLL_MS);
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void session.poll();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [allowed, session]));

  const tab = useMemo(() => ({ organizationId, select }), [organizationId, select]);
  // Tabs.Protected already hides this tab; this also stops a direct link.
  if (!allowed) return <Redirect href="/" />;
  return (
    <OrganizerContext.Provider value={{ session }}>
      <OrganizationTabContext.Provider value={tab}>
        {/* Screens set their own titles, so the declared order always matches the seeded one. */}
        <Stack screenOptions={{
          headerRight: () => <DataSourceBadge />,
          headerStyle: headerStyles.header,
          headerShadowVisible: false,
          headerTintColor: tone.amber,
          headerBackButtonDisplayMode: 'minimal',
          headerTitleStyle: { color: tone.ink },
        }} />
      </OrganizationTabContext.Provider>
    </OrganizerContext.Provider>
  );
}
