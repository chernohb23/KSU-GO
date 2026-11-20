import { forwardRef, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockClearance } from '../navigation/DockSpace';
import { space } from '../navigation/theme';

/** Content can scroll behind the floating dock, but its last control always clears it. */
export const ScreenScrollView = forwardRef<ComponentRef<typeof ScrollView>, ScrollViewProps>(
  function ScreenScrollView({ contentContainerStyle, horizontal, scrollIndicatorInsets, ...props }, ref) {
    const clearance = useDockClearance();
    const safe = useSafeAreaInsets();
    const original = StyleSheet.flatten(contentContainerStyle);
    const padding = original?.paddingBottom ?? original?.paddingVertical ?? original?.padding ?? 0;
    const bottom = horizontal ? undefined : Math.max(typeof padding === 'number' ? padding : 0, clearance || safe.bottom + space.xl);
    return <ScrollView ref={ref} {...props} horizontal={horizontal}
      contentContainerStyle={[contentContainerStyle, !horizontal && { paddingBottom: bottom }]}
      scrollIndicatorInsets={{ ...scrollIndicatorInsets, bottom: horizontal ? 0 : Math.max(clearance, safe.bottom) }} />;
  },
);
