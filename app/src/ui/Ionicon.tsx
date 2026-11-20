import { Image, Pressable, StyleSheet } from 'react-native';

import { tone } from '../navigation/theme';

// Ionicons 7.4.0 (MIT): https://github.com/ionic-team/ionicons/tree/v7.4.0
// Four bundled glyphs, rasterized at 96px from the adjacent SVG sources.
// No font loader or runtime dependency. License: assets/ionicons/LICENSE.txt.
const icons = {
  calendar: require('../../assets/ionicons/calendar-outline.png'),
  mail: require('../../assets/ionicons/mail-outline.png'),
  globe: require('../../assets/ionicons/globe-outline.png'),
  pencil: require('../../assets/ionicons/pencil-outline.png'),
};
export type IoniconName = keyof typeof icons;

export function Ionicon({ name, size = 22, color = tone.muted }: { name: IoniconName; size?: number; color?: string }) {
  return <Image accessible={false} source={icons[name]} style={{ width: size, height: size, tintColor: color }} />;
}

export function HeaderIconButton({ name, label, onPress }: { name: IoniconName; label: string; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
    <Ionicon name={name} color={tone.amber} />
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});
