import { Stack } from 'expo-router';

import { AppDataProvider } from '../src/data/AppDataProvider';
import { AppTitle, DataSourceBadge, headerStyles } from '../src/navigation/AppHeader';

export default function RootLayout() {
  return (
    <AppDataProvider>
      <Stack screenOptions={{
        headerTitle: () => <AppTitle />,
        headerRight: () => <DataSourceBadge />,
        headerStyle: headerStyles.header,
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Server settings' }} />
      </Stack>
    </AppDataProvider>
  );
}
