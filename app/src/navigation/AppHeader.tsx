import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppData } from '../data/AppDataContext';
import { BrandMark, palette } from './Brand';

export function AppTitle() {
  const router = useRouter();
  return (
    <Pressable style={styles.brand} onLongPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Open server settings">
      <BrandMark size={29} />
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
  header: { backgroundColor: palette.paper },
});

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: palette.ink, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  badge: { marginRight: 10, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  offline: { backgroundColor: '#ece3c8' },
  online: { backgroundColor: '#e0eee4' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  offlineText: { color: '#6b4b00' },
  onlineText: { color: '#326144' },
});
