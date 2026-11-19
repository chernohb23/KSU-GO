import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';

import { createApiClient } from '../../../src/api/client';
import { useAppData } from '../../../src/data/AppDataContext';
import { bundledDrafts } from '../../../src/data/bundledDrafts';
import { OrganizerContext } from '../../../src/organizer/context';
import { OrganizerSession, ROUTE_POLL_MS } from '../../../src/organizer/session';
import { ModeSwitch, styles } from '../../../src/organizer/ui';

export const unstable_settings = { initialRouteName: 'index' };
const MODE_KEY = 'ksu-go.organizer-mode';

export default function OrganizerLayout() {
  const { serverUrl } = useAppData();
  const api = useMemo(() => serverUrl ? createApiClient(serverUrl) : null, [serverUrl]);
  const [session] = useState(() => new OrganizerSession(api, AsyncStorage, bundledDrafts));
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [modeError, setModeError] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(MODE_KEY).then((value) => {
      if (active) setEnabled(value === 'on');
    }).catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, []);

  function changeMode(next: boolean) {
    setEnabled(next);
    setModeError(false);
    void AsyncStorage.setItem(MODE_KEY, next ? 'on' : 'off').catch(() => setModeError(true));
  }

  useEffect(() => { session.setApi(api); }, [api, session]);
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    void session.refresh();
    const timer = setInterval(() => { void session.poll(); }, ROUTE_POLL_MS);
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void session.refresh();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [api, enabled, session]));

  if (enabled === null) return <ActivityIndicator accessibilityLabel="Loading organizer mode" />;
  return (
    <View style={styles.screen}>
      {modeError && <Text style={styles.notice}>Could not save the organizer switch on this device.</Text>}
      {enabled ? (
        <OrganizerContext.Provider value={{ session, turnOff: () => changeMode(false) }}>
          <Stack screenOptions={{ headerShown: false }} />
        </OrganizerContext.Provider>
      ) : (
        <View style={styles.content}>
          <ModeSwitch enabled={false} onChange={() => changeMode(true)} />
          <Text style={styles.body}>Turn on organizer mode to upload a walkthrough or review a route draft.</Text>
        </View>
      )}
    </View>
  );
}
