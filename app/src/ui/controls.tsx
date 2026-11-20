// Shared building blocks for the paper screens: grouped sections, fields, chips and
// buttons on the phase C type scale and 8-point grid.

import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { radius, space, text, tone } from '../navigation/theme';

/** A footnote label above an inset group, like iOS Settings. */
export function Section({ label, footer, children }: PropsWithChildren<{ label?: string; footer?: string }>) {
  return (
    <View style={styles.section}>
      {label ? <Text style={styles.sectionLabel}>{label}</Text> : null}
      {children}
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

export function Group({ children }: PropsWithChildren) {
  return <View style={styles.group}>{children}</View>;
}

/** A row in a group: label on the left, value or accessory on the right. */
export function Row({ label, value, onPress, last = false, accessory, destructive = false }: {
  label: string; value?: string | null; onPress?: () => void; last?: boolean; accessory?: ReactNode; destructive?: boolean;
}) {
  const body = (
    <View style={[styles.row, !last && styles.divider]}>
      <Text style={[text.body, styles.rowLabel, destructive && styles.destructive]} numberOfLines={1}>{label}</Text>
      {value ? <Text style={[text.subhead, styles.rowValue]} numberOfLines={1}>{value}</Text> : null}
      {accessory}
      {onPress && !accessory ? <Text style={styles.chevron}>›</Text> : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>{body}</Pressable>
  ) : body;
}

export function Field({ label, last = false, multiline = false, ...input }: TextInputProps & { label: string; last?: boolean }) {
  return (
    <View style={[styles.field, !last && styles.divider]}>
      <Text style={text.footnote}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#9aa5aa" multiline={multiline}
        style={[text.body, styles.input, multiline && styles.multiline]} {...input} />
    </View>
  );
}

export function Chip({ label, selected, onPress, disabled = false }: {
  label: string; selected: boolean; onPress(): void; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, disabled && styles.dimmed, pressed && styles.pressed]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: PropsWithChildren) {
  return <View style={styles.chips}>{children}</View>;
}

export function Button({ label, onPress, kind = 'primary', busy = false, disabled = false }: {
  label: string; onPress(): void; kind?: 'primary' | 'secondary' | 'ink' | 'destructive' | 'gold' | 'outline'; busy?: boolean; disabled?: boolean;
}) {
  const off = busy || disabled;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: off, busy }} disabled={off} onPress={onPress}
      style={({ pressed }) => [styles.button, containers[kind], off && styles.dimmed, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color={kind === 'secondary' || kind === 'destructive' || kind === 'gold' || kind === 'outline' ? tone.ink : tone.surface} /> : (
        <Text style={[text.headline, kind === 'secondary' || kind === 'gold' || kind === 'outline' ? styles.onPaper : kind === 'destructive' ? styles.destructive : styles.onFill]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Notice({ message, kind = 'error' }: { message: string | null; kind?: 'error' | 'info' }) {
  if (!message) return null;
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.notice, kind === 'info' && styles.info]}>{message}</Text>;
}

/** An iOS-style segmented control. */
export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { key: T; label: string }[]; onChange(next: T): void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.segmented}>
      {options.map(({ key, label }) => {
        const selected = key === value;
        return (
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(key)}
            style={[styles.segment, selected && styles.segmentSelected]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A circle with initials: organization logos and profile avatars. */
export function Badge({ label, color, size }: { label: string; color: 'gold' | 'ink' | 'amber'; size: number }) {
  const background = color === 'gold' ? tone.gold : color === 'ink' ? tone.ink : tone.amber;
  const foreground = color === 'gold' ? tone.ink : tone.paper;
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background,
      alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: foreground, fontSize: Math.round(size * (label.length > 2 ? 0.3 : 0.36)), fontWeight: '700', letterSpacing: 0.5 }}>
        {label}
      </Text>
    </View>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

const containers = StyleSheet.create({
  primary: { backgroundColor: tone.amber },
  gold: { backgroundColor: tone.gold },
  outline: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: tone.ink },
  ink: { backgroundColor: tone.ink },
  secondary: { backgroundColor: tone.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  destructive: { backgroundColor: tone.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
});

export const screenStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tone.paper },
  content: { padding: space.gutter, paddingBottom: space.xxl * 2, gap: space.xl },
});

const styles = StyleSheet.create({
  section: { gap: space.s },
  sectionLabel: { ...text.footnote, paddingLeft: space.l },
  sectionFooter: { ...text.footnote, paddingHorizontal: space.l },
  group: { borderRadius: radius.group, backgroundColor: tone.surface, paddingLeft: space.l, overflow: 'hidden' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingRight: space.l, paddingVertical: space.s },
  rowLabel: { flexShrink: 1 },
  rowValue: { flex: 1, textAlign: 'right' },
  chevron: { color: '#b3bbb9', fontSize: 22, marginTop: -2 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  field: { paddingVertical: space.s, paddingRight: space.l, gap: 2 },
  input: { minHeight: 30, paddingVertical: 2 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: { minHeight: 36, paddingHorizontal: space.m + 2, borderRadius: 18, justifyContent: 'center',
    backgroundColor: tone.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  chipSelected: { backgroundColor: tone.ink, borderColor: tone.ink },
  chipText: { ...text.subhead, color: tone.ink, fontWeight: '500' },
  chipTextSelected: { color: tone.paper, fontWeight: '600' },
  button: { minHeight: 50, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.l },
  destructive: { color: tone.danger },
  onFill: { color: tone.surface },
  onPaper: { color: tone.ink },
  dimmed: { opacity: 0.45 },
  pressed: { opacity: 0.65 },
  segmented: { flexDirection: 'row', padding: 2, borderRadius: 9, backgroundColor: tone.fill },
  segment: { flex: 1, minHeight: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: tone.surface, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { ...text.subhead, color: tone.ink, fontWeight: '500' },
  segmentTextSelected: { fontWeight: '600' },
  notice: { ...text.subhead, color: tone.error },
  info: { color: tone.muted },
});
