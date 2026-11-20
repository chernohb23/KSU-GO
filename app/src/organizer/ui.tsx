import { palette } from '../navigation/Brand';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import campus from '../../../shared/fixtures/campus.json';

export function buildingName(id: string) {
  return campus.buildings.find((item) => item.id === id)?.name ?? id;
}

export function Action({ label, onPress, secondary = false, disabled = false }: {
  label: string; onPress(): void; secondary?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
      style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ label, percent }: { label: string; percent: number }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: value }}>
      <Text style={styles.label}>{label} · {value}%</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${value}%` }]} /></View>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.paper },
  content: { padding: 20, paddingBottom: 42, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { color: palette.ink, fontSize: 25, fontWeight: '700' },
  heading: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  label: { color: palette.ink, fontSize: 16, fontWeight: '600' },
  body: { color: '#43515c', fontSize: 15, lineHeight: 22 },
  notice: { color: '#7a3225', fontSize: 15, lineHeight: 22 },
  card: { padding: 15, gap: 6, borderRadius: 12, backgroundColor: '#fff', borderColor: '#d5dde1', borderWidth: 1 },
  field: { gap: 6 },
  input: { color: palette.ink, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#8999a4', minHeight: 46, paddingHorizontal: 12 },
  button: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: palette.amber },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondary: { borderWidth: 1, borderColor: '#8999a4', backgroundColor: '#fff' },
  secondaryText: { color: palette.ink },
  disabled: { opacity: 0.5 },
  track: { marginTop: 9, height: 8, backgroundColor: '#dbe2e5', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: palette.amber },
});
