import { Image } from 'react-native';
import { Tabs } from 'expo-router';

import { AppTitle, DataSourceBadge, headerStyles } from '../../src/navigation/AppHeader';
import { palette } from '../../src/navigation/Brand';

const icons = {
  index: require('../../assets/map.png'),
  week: require('../../assets/week.png'),
  route: require('../../assets/route.png'),
  organizer: require('../../assets/organizer.png'),
};

export default function TabsLayout() {
  return (
    <Tabs screenOptions={({ route }) => ({
      headerTitle: () => <AppTitle />,
      headerRight: () => <DataSourceBadge />,
      headerStyle: headerStyles.header,
      tabBarActiveTintColor: palette.amber,
      tabBarInactiveTintColor: palette.muted,
      tabBarStyle: { backgroundColor: palette.paper },
      tabBarLabelStyle: { fontWeight: '600' },
      tabBarIcon: ({ color, size }) => (
        <Image accessible={false} source={icons[route.name as keyof typeof icons]}
          style={{ width: size, height: size, tintColor: color }} />
      ),
    })}>
      <Tabs.Screen name="index" options={{ title: 'Map' }} />
      <Tabs.Screen name="week" options={{ title: 'This week' }} />
      <Tabs.Screen name="route" options={{ title: 'Route' }} />
      <Tabs.Screen name="organizer" options={{ title: 'Organizer' }} />
    </Tabs>
  );
}
