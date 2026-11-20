import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppData } from '../data/AppDataContext';
import { BrandMark, palette } from './Brand';

/** The brand title. A long-press opens the hidden settings, also before signing in. */
export function AppTitle({ variant = 'paper' }: { variant?: 'paper' | 'ink' }) {
  const router = useRouter();
  return (
    <Pressable style={styles.brand} onLongPress={() => router.push('/settings')} accessibilityRole="button"
      accessibilityLabel="KSU-GO" accessibilityHint="Long-press to open settings">
      <BrandMark size={29} />
      <Text style={[styles.title, variant === 'ink' && styles.inkTitle]}>KSU-GO</Text>
    </Pressable>
  );
}

/** Shown only while the app is on bundled data; hidden while the server answers. */
export function DataSourceBadge() {
  const { offline } = useAppData();
  if (!offline) return null;
  return (
    <View accessibilityLabel="Offline data" style={styles.badge}>
      <Text style={styles.badgeText}>Offline data</Text>
    </View>
  );
}

export const headerStyles = StyleSheet.create({
  header: { backgroundColor: palette.paper },
});

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: palette.ink, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  inkTitle: { color: palette.paper },
  // Same height as the 29 pt brand mark, centered, so the badge sits on the title's center line.
  badge: { height: 29, marginRight: 10, justifyContent: 'center', borderRadius: 14.5, paddingHorizontal: 10, backgroundColor: '#ece3c8' },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#6b4b00' },
});
