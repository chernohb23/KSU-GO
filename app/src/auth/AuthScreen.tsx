import { StatusBar } from 'expo-status-bar';
import { forwardRef, type ComponentRef, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  View, type TextInputProps,
} from 'react-native';

import { radius, space, text, tone } from '../navigation/theme';

/** Ink panel under the ink header, then a paper sheet holding the form. */
export function AuthScreen({ headline, lede, children }: PropsWithChildren<{ headline: string; lede: string }>) {
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'android' ? 'height' : undefined}>
      <StatusBar style="light" />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        {/* Ink above the content, so pulling down at the top never shows paper. */}
        <View pointerEvents="none" style={styles.overscroll} />
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.headline}>{headline}</Text>
          <Text style={styles.lede}>{lede}</Text>
        </View>
        <View style={styles.sheet}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Inset group of fields with hairlines between them, like iOS Settings. */
export function FieldGroup({ children }: PropsWithChildren) {
  return <View style={styles.group}>{children}</View>;
}

export type FieldHandle = ComponentRef<typeof TextInput>;

export const Field = forwardRef<FieldHandle, TextInputProps & { label: string; last?: boolean }>(
  function Field({ label, last = false, style, ...input }, ref) {
    return (
      <View style={[styles.field, !last && styles.fieldDivider]}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput ref={ref} accessibilityLabel={label} placeholderTextColor="#9aa5aa"
          style={[styles.input, style]} {...input} />
      </View>
    );
  },
);

export function PrimaryButton({ label, busy = false, disabled = false, onPress }: {
  label: string; busy?: boolean; disabled?: boolean; onPress(): void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => [styles.primary, (disabled || busy) && styles.dimmed, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color={tone.surface} /> : <Text style={styles.primaryText}>{label}</Text>}
    </Pressable>
  );
}

export function TextButton({ label, onPress, accessory }: { label: string; onPress(): void; accessory?: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}
      style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
      <Text style={styles.textButtonLabel}>{label}</Text>
      {accessory}
    </Pressable>
  );
}

export function FormMessage({ message, tone: kind = 'error' }: { message: string | null; tone?: 'error' | 'info' }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={[styles.message, kind === 'info' && styles.info]}>{message}</Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tone.ink },
  scrollView: { flex: 1, backgroundColor: tone.paper },
  // Ink behind the sheet's rounded corners; the scroll view's paper shows only past the bottom.
  scroll: { flexGrow: 1, backgroundColor: tone.ink },
  overscroll: { position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: tone.ink },
  panel: { backgroundColor: tone.ink, paddingHorizontal: space.gutter, paddingTop: space.l, paddingBottom: space.xxl, gap: space.s },
  headline: { ...text.largeTitle, color: tone.paper },
  lede: { ...text.body, color: tone.gold },
  sheet: { flexGrow: 1, backgroundColor: tone.paper, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.gutter, paddingTop: space.xl, paddingBottom: space.xxl, gap: space.l },
  group: { borderRadius: radius.group, backgroundColor: tone.surface, paddingLeft: space.l },
  field: { paddingVertical: space.s, paddingRight: space.l, gap: 2 },
  fieldDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  fieldLabel: { ...text.footnote },
  input: { ...text.body, minHeight: 30, paddingVertical: 2 },
  primary: { minHeight: 50, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: tone.amber },
  primaryText: { ...text.headline, color: tone.surface },
  dimmed: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  textButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  textButtonLabel: { ...text.headline, color: tone.amber },
  message: { ...text.subhead, color: tone.error },
  info: { color: tone.ink },
});
