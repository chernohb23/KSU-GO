import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, View } from 'react-native';

import { useReduceTransparency } from '../ui/accessibility';
import { haptic } from '../ui/haptics';
import { Ionicon, type IoniconName } from '../ui/Ionicon';
import { PressScale } from '../ui/PressScale';
import { dockLayout } from './dockLayout';
import { blur, dock, text, tone } from './theme';

const LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
const icons: Record<string, IoniconName> = { index: 'map', events: 'calendar', organization: 'people', profile: 'person-circle' };

function DockBackground() {
  const opaque = useReduceTransparency();
  if (opaque) return <View style={[styles.capsule, styles.opaque]} />;
  if (LIQUID_GLASS) return <GlassView glassEffectStyle="regular" style={styles.capsule} />;
  return <View style={styles.capsule}>
    <BlurView intensity={blur.intensity} tint={blur.tint} style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, styles.tint]} />
  </View>;
}

export function Dock({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const [keyboard, setKeyboard] = useState(Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboard(false));
    const showAndroid = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hideAndroid = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => { show.remove(); hide.remove(); showAndroid.remove(); hideAndroid.remove(); };
  }, []);
  if (keyboard) return null;
  return <View style={[styles.dock, { bottom: dockLayout(insets.bottom).bottom }]} accessibilityRole="tablist">
    <DockBackground />
    {state.routes.filter(route => !descriptors[route.key].options.hidden).map((route) => {
      const options = descriptors[route.key].options;
      const selected = state.routes[state.index].key === route.key;
      const name = route.name.replace(/\/index$/, '');
      const icon = icons[name];
      return <PressScale key={route.key} accessibilityRole="tab" accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? name}
        accessibilityState={{ selected }} feedback={false} style={styles.item}
        onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
        onPress={() => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!selected && !event.defaultPrevented) {
            haptic('selection');
            navigateToTab(route.key);
          }
        }}>
        <Ionicon name={icon} outline={!selected} color={selected ? tone.amber : tone.muted} size={dock.iconSize} />
        <Text style={[styles.label, selected && styles.selected]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {options.title ?? name}
        </Text>
      </PressScale>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', start: dock.sideInset, end: dock.sideInset, height: dock.height, flexDirection: 'row',
    borderRadius: 999, shadowColor: tone.ink, shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  capsule: { ...StyleSheet.absoluteFill, borderRadius: 999, overflow: 'hidden' },
  opaque: { backgroundColor: tone.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  tint: { borderRadius: 999, backgroundColor: blur.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  item: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4, gap: 4 },
  label: { ...text.footnote, fontWeight: '500', width: '100%', textAlign: 'center' },
  selected: { color: tone.amber, fontWeight: '600' },
});
