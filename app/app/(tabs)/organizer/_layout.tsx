import { Redirect, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, View } from 'react-native';

import { useAccount } from '../../../src/account/AccountProvider';
import { useAuth } from '../../../src/auth/AuthProvider';
import { bundledDrafts } from '../../../src/data/bundledRoutes';
import { isOrganizer } from '../../../src/navigation/access';
import { OrganizerContext } from '../../../src/organizer/context';
import { OrganizerSession, ROUTE_POLL_MS } from '../../../src/organizer/session';
import { styles } from '../../../src/organizer/ui';

export const unstable_settings = { initialRouteName: 'index' };

export default function OrganizerLayout() {
  const { state } = useAuth();
  const { api, storage } = useAccount();
  // One session per account: `storage` is scoped to ksu-go.account.<id>, so upload
  // history stays with its account. A new server address reaches it through setApi.
  const [initialApi] = useState(api);
  const session = useMemo(() => new OrganizerSession(initialApi, storage, bundledDrafts), [initialApi, storage]);
  const allowed = isOrganizer(state);

  useEffect(() => { session.setApi(api); }, [api, session]);
  useFocusEffect(useCallback(() => {
    if (!allowed) return;
    void session.refresh();
    const timer = setInterval(() => { void session.poll(); }, ROUTE_POLL_MS);
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void session.refresh();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [allowed, api, session]));

  // Tabs.Protected already hides this tab; this also stops a direct link.
  if (!allowed) return <Redirect href="/" />;
  return (
    <View style={styles.screen}>
      <OrganizerContext.Provider value={{ session }}>
        <Stack screenOptions={{ headerShown: false }} />
      </OrganizerContext.Provider>
    </View>
  );
}
