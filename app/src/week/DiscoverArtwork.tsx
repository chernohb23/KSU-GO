import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import type { Event } from '../../../shared/types';
import { radius, tone } from '../navigation/theme';
import { Ionicon, type IoniconName } from '../ui/Ionicon';

const artwork: Record<Event['category'], { icon: IoniconName; tint: string }> = {
  academic: { icon: 'book', tint: tone.ink },
  social: { icon: 'people', tint: tone.gold },
  career: { icon: 'briefcase', tint: tone.muted },
  sports: { icon: 'basketball', tint: tone.amber },
  arts: { icon: 'color-palette', tint: tone.gold },
  other: { icon: 'sparkles', tint: tone.ink },
};

/** Decorative, offline artwork; a future image can be supplied without changing Event. */
export function DiscoverArtwork({ category, imageUri }: { category: Event['category']; imageUri?: string }) {
  const [failedUri, setFailedUri] = useState<string>();
  const { icon, tint } = artwork[category];
  return <View style={styles.frame} pointerEvents="none" accessible={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {imageUri && imageUri !== failedUri ? (
      <Image source={{ uri: imageUri }} resizeMode="cover" style={StyleSheet.absoluteFill}
        onError={() => setFailedUri(imageUri)} />
    ) : <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.12 }]} />
      <View style={[styles.ring, { borderColor: tint }]} />
      <View style={[styles.square, { backgroundColor: tint }]} />
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <View style={styles.medallion}>
        <Ionicon name={icon} size={64} color={tone.ink} />
      </View>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, flexShrink: 0, borderRadius: radius.group, overflow: 'hidden',
    backgroundColor: tone.paper, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 144, height: 144, borderRadius: 72, borderWidth: 16,
    left: -48, top: -48, opacity: 0.08 },
  square: { position: 'absolute', width: 96, height: 96, borderRadius: radius.group,
    right: -24, bottom: -40, transform: [{ rotate: '-24deg' }], opacity: 0.08 },
  dot: { position: 'absolute', width: 24, height: 24, borderRadius: 12, right: 32, top: 24, opacity: 0.12 },
  medallion: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#ffffff80',
    alignItems: 'center', justifyContent: 'center' },
});
