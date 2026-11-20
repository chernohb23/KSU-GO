import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, StyleSheet, View } from 'react-native';

import { blur, tone } from '../navigation/theme';
import { useReduceTransparency } from './accessibility';

const LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/** One material for the dock and Map controls, including accessibility fallbacks. */
export function GlassBackground() {
  const opaque = useReduceTransparency();
  if (opaque) return <View pointerEvents="none" style={[styles.capsule, styles.opaque]} />;
  if (LIQUID_GLASS) return <GlassView pointerEvents="none" glassEffectStyle="regular" style={styles.capsule} />;
  return <View pointerEvents="none" style={styles.capsule}>
    <BlurView intensity={blur.intensity} tint={blur.tint} style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, styles.tint]} />
  </View>;
}

const styles = StyleSheet.create({
  capsule: { ...StyleSheet.absoluteFill, borderRadius: 999, overflow: 'hidden' },
  opaque: { backgroundColor: tone.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  tint: { borderRadius: 999, backgroundColor: blur.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
});
