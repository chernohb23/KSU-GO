import { Image } from 'react-native';
import { Tabs } from 'expo-router';

import { useAuth } from '../../src/auth/AuthProvider';
import { AppTitle, DataSourceBadge, headerStyles } from '../../src/navigation/AppHeader';
import { isOrganizer } from '../../src/navigation/access';
import { tone } from '../../src/navigation/theme';

const icons = {
  index: require('../../assets/map.png'),
  events: require('../../assets/week.png'),
  organizer: require('../../assets/organizer.png'),
  profile: require('../../assets/profile.png'),
};

export default function TabsLayout() {
  const { state } = useAuth();
  return (
    <Tabs screenOptions={({ route }) => ({
      headerTitle: () => <AppTitle />,
      headerRight: () => <DataSourceBadge />,
      headerStyle: headerStyles.header,
      headerShadowVisible: false,
      tabBarActiveTintColor: tone.amber,
      tabBarInactiveTintColor: tone.muted,
      tabBarStyle: { backgroundColor: tone.paper },
      tabBarLabelStyle: { fontWeight: '600' },
      tabBarIcon: ({ color, size }) => (
        <Image accessible={false} source={icons[route.name as keyof typeof icons]}
          style={{ width: size, height: size, tintColor: color }} />
      ),
    })}>
      <Tabs.Screen name="index" options={{ title: 'Map' }} />
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
      <Tabs.Protected guard={isOrganizer(state)}>
        <Tabs.Screen name="organizer" options={{ title: 'Organizer' }} />
      </Tabs.Protected>
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
