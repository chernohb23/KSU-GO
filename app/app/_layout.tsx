import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppDataProvider } from '../src/data/AppDataProvider';
import { useAppData } from '../src/data/AppDataContext';

function AppTitle() {
  const router = useRouter();
  return (
    <Pressable onLongPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Open server settings">
      <Text style={styles.title}>KSU-GO</Text>
    </Pressable>
  );
}

function DataSourceBadge() {
  const { offline } = useAppData();
  return (
    <View accessibilityLabel={offline ? 'Offline data' : 'Server data'} style={[styles.badge, offline ? styles.offline : styles.online]}>
      <Text style={[styles.badgeText, offline ? styles.offlineText : styles.onlineText]}>{offline ? 'Offline data' : 'Server data'}</Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <AppDataProvider>
      <Tabs screenOptions={{
        headerTitle: () => <AppTitle />,
        headerRight: () => <DataSourceBadge />,
        headerStyle: { backgroundColor: '#f5f7f8' },
        tabBarActiveTintColor: '#805b08',
      }}>
        <Tabs.Screen name="index" options={{ title: 'Map' }} />
        <Tabs.Screen name="route" options={{ title: 'Route' }} />
        <Tabs.Screen name="organizer" options={{ title: 'Organizer' }} />
        <Tabs.Screen name="settings" options={{ href: null, title: 'Server settings' }} />
      </Tabs>
    </AppDataProvider>
  );
}

const styles = StyleSheet.create({
  title: { color: '#17212a', fontSize: 17, fontWeight: '700' },
  badge: { marginRight: 10, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  offline: { backgroundColor: '#ece3c8' },
  online: { backgroundColor: '#e0eee4' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  offlineText: { color: '#6b4b00' },
  onlineText: { color: '#326144' },
});
