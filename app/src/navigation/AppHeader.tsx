import { PressScale } from '../ui/PressScale';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useAppData } from '../data/AppDataContext';
import { BrandMark, palette } from './Brand';

/** Static brand by default; only sign-in opts into the team shortcut. */
export function AppTitle({ variant = 'paper', settingsShortcut = false, compact = false }: {
  variant?: 'paper' | 'ink'; settingsShortcut?: boolean; compact?: boolean;
}) {
  const router = useRouter();
  const content = <>
    <BrandMark size={compact ? 22 : 29} />
    <Text style={[styles.title, compact && styles.compactTitle, variant === 'ink' && styles.inkTitle]}
      numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.2}>KSU GO</Text>
  </>;
  if (!settingsShortcut) return <View style={styles.brand}>{content}</View>;
  return (
    <PressScale style={styles.brand} onLongPress={() => router.push('/settings')} accessibilityRole="button"
      accessibilityLabel="KSU GO" accessibilityHint="Long-press to open settings">
      {content}
    </PressScale>
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

const renderDataSourceBadge = () => <DataSourceBadge />;
const renderOfflineItems = () => [{ type: 'custom' as const, element: <DataSourceBadge />, hidesSharedBackground: true }];

/** Native headers create a container for any callback, even one that returns null. */
export function useOfflineHeaderRight() {
  const { offline } = useAppData();
  return offline ? renderDataSourceBadge : undefined;
}

/** Suppress iOS 26's extra glass capsule around our existing offline badge. */
export function useOfflineNativeHeaderItems() {
  const { offline } = useAppData();
  return offline ? renderOfflineItems : undefined;
}

export const headerStyles = StyleSheet.create({
  header: { backgroundColor: palette.paper },
});

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  title: { color: palette.ink, fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
  compactTitle: { fontSize: 15, flexShrink: 1 },
  inkTitle: { color: palette.paper },
  // Same height as the 29 pt brand mark, centered, so the badge sits on the title's center line.
  badge: { height: 29, justifyContent: 'center', borderRadius: 14.5, paddingHorizontal: 10, backgroundColor: '#ece3c8' },
  badgeText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#6b4b00' },
});
