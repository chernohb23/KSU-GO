import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppData } from '../data/AppDataContext';

export function AppTitle() {
  const router = useRouter();
  return (
    <Pressable onLongPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Open server settings">
      <Text style={styles.title}>KSU-GO</Text>
    </Pressable>
  );
}

export function DataSourceBadge() {
  const { offline } = useAppData();
  return (
    <View accessibilityLabel={offline ? 'Offline data' : 'Server data'} style={[styles.badge, offline ? styles.offline : styles.online]}>
      <Text style={[styles.badgeText, offline ? styles.offlineText : styles.onlineText]}>{offline ? 'Offline data' : 'Server data'}</Text>
    </View>
  );
}

export const headerStyles = StyleSheet.create({
  header: { backgroundColor: '#f5f7f8' },
});

const styles = StyleSheet.create({
  title: { color: '#17212a', fontSize: 17, fontWeight: '700' },
  badge: { marginRight: 10, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  offline: { backgroundColor: '#ece3c8' },
  online: { backgroundColor: '#e0eee4' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  offlineText: { color: '#6b4b00' },
  onlineText: { color: '#326144' },
});
