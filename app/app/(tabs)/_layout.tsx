import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../src/auth/AuthProvider';
import { headerStyles, useOfflineHeaderRight } from '../../src/navigation/AppHeader';
import { ownsOrganization } from '../../src/navigation/access';
import { tone } from '../../src/navigation/theme';
import { Dock } from '../../src/navigation/Dock';
import { DockSpaceContext } from '../../src/navigation/DockSpace';
import { dockLayout } from '../../src/navigation/dockLayout';
import { dock } from '../../src/navigation/theme';


export default function TabsLayout() {
  const { state } = useAuth();
  const headerRight = useOfflineHeaderRight();
  const safe = useSafeAreaInsets();
  return (
    <DockSpaceContext.Provider value={dockLayout(safe.bottom).clearance}>
    <Tabs tabBar={(props) => <Dock {...props} />} screenOptions={{
      headerTitleAlign: 'center',
      headerTitleStyle: { fontSize: 17, fontWeight: '600', color: tone.ink },
      headerRight,
      headerStyle: headerStyles.header,
      headerShadowVisible: false,
      tabBarActiveTintColor: tone.amber,
      tabBarInactiveTintColor: tone.muted,
      tabBarStyle: { position: 'absolute', height: dock.height, backgroundColor: 'transparent' },
      tabBarLabelStyle: { fontWeight: '600' },
    }}>
      {/* Declared in the same order expo-router seeds the tab state (index first, then
          shorter route names first), so mounting the tabs on sign-in queues no
          ROUTE_NAMES_CHANGED. That is why Profile is profile/index (13 characters)
          and sorts after organization (12). Keep this order when adding tabs. */}
      <Tabs.Screen name="index" options={{ title: 'Map', headerShown: false }} />
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
      <Tabs.Protected guard={ownsOrganization(state)}>
        <Tabs.Screen name="organization" options={{ title: 'Organization', headerShown: false }} />
      </Tabs.Protected>
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
    </DockSpaceContext.Provider>
  );
}
