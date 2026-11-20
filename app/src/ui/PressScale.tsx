import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { motion } from '../navigation/theme';
import { useReduceMotion } from './accessibility';
import { haptic, type HapticKind } from './haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export type PressScaleProps = PressableProps & { feedback?: HapticKind | false; scaleEffect?: boolean };

/** Native-driver feedback for every app control; keeps existing press styles and handlers. */
export function PressScale({ style, onPress, onLongPress, onPressIn, onPressOut, disabled, feedback = 'light', scaleEffect = true, ...rest }: PressScaleProps) {
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useReduceMotion();
  const interactive = !disabled && (!!onPress || !!onLongPress || !!rest.onAccessibilityAction);
  useEffect(() => {
    if (reduceMotion || !interactive || !scaleEffect) { scale.stopAnimation(); scale.setValue(1); }
    if (!interactive) setPressed(false);
    return () => scale.stopAnimation();
  }, [interactive, reduceMotion, scale, scaleEffect]);
  // Resolve Pressable callbacks here: Animated ignores a function-valued style,
  // so the native animation graph must receive the transform as an array.
  const base = typeof style === 'function' ? style({ pressed }) : style;
  const previous = StyleSheet.flatten(base)?.transform;
  return <AnimatedPressable {...rest} disabled={!interactive}
    onPress={onPress ? (event) => { event.stopPropagation(); if (feedback) haptic(feedback); onPress(event); } : undefined}
    onLongPress={onLongPress ? (event) => { event.stopPropagation(); if (feedback) haptic(feedback); onLongPress(event); } : undefined}
    onPressIn={(event) => {
      if (!interactive) return;
      setPressed(true);
      if (!reduceMotion && scaleEffect) Animated.spring(scale, { toValue: motion.pressedScale, ...motion.pressIn, useNativeDriver: true }).start();
      onPressIn?.(event);
    }}
    onPressOut={(event) => {
      if (!interactive) return;
      setPressed(false);
      if (!reduceMotion && scaleEffect) Animated.spring(scale, { toValue: 1, ...motion.release, useNativeDriver: true }).start();
      onPressOut?.(event);
    }}
    style={[base, { transform: [...(typeof previous === 'string' ? [] : previous ?? []), { scale }] }]} />;
}
