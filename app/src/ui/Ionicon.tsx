import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';

import { tone } from '../navigation/theme';
import { PressScale } from './PressScale';

export type IoniconName = 'calendar' | 'mail' | 'globe' | 'pencil' | 'map' | 'people' | 'person-circle'
  | 'refresh' | 'information-circle' | 'close' | 'chevron-forward' | 'chevron-down' | 'checkmark' | 'bookmark' | 'star'
  | 'book' | 'briefcase' | 'basketball' | 'color-palette' | 'sparkles';

export function Ionicon({ name, size = 22, color = tone.muted, outline = true }: { name: IoniconName; size?: number; color?: string; outline?: boolean }) {
  const glyph = (outline ? `${name}-outline` : name) as ComponentProps<typeof Ionicons>['name'];
  return <Ionicons accessible={false} name={glyph} size={size} color={color} />;
}

export function HeaderIconButton({ name, label, onPress }: { name: IoniconName; label: string; onPress(): void }) {
  return <PressScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
    <Ionicon name={name} color={tone.amber} />
  </PressScale>;
}

const styles = StyleSheet.create({
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});
