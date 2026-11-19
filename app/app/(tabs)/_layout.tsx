import { Tabs } from 'expo-router';

import { AppTitle, DataSourceBadge, headerStyles } from '../../src/navigation/AppHeader';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerTitle: () => <AppTitle />,
      headerRight: () => <DataSourceBadge />,
      headerStyle: headerStyles.header,
      tabBarActiveTintColor: '#805b08',
    }}>
      <Tabs.Screen name="index" options={{ title: 'Map' }} />
      <Tabs.Screen name="week" options={{ title: 'This week' }} />
      <Tabs.Screen name="route" options={{ title: 'Route' }} />
      <Tabs.Screen name="organizer" options={{ title: 'Organizer' }} />
    </Tabs>
  );
}
