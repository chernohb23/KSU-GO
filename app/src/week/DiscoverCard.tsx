import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { roomLabel } from '../../../shared/rooms';
import type { Event } from '../../../shared/types';
import { useAccount } from '../account/AccountProvider';
import { categoryLabel } from '../account/insights';
import { et } from '../events/format';
import { radius, space, text, tone } from '../navigation/theme';
import { buildingName } from '../organizer/ui';
import { useReduceMotion } from '../ui/accessibility';
import { haptic } from '../ui/haptics';
import { PressScale } from '../ui/PressScale';
import { swipeDecision, type Decision } from './choices';
import { needsDiscoverHint, rememberDiscoverSwipe } from './tutorial';
import { DiscoverArtwork } from './DiscoverArtwork';

export function DiscoverCard({ event, onOpen, onError }: { event: Event; onOpen(): void; onError(message: string): void }) {
  const { storage, weekChoices } = useAccount();
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const [showHint, setShowHint] = useState(false);
  const wiggleDone = useRef(false);
  const offset = useSharedValue(0);
  const leaving = useSharedValue(false);
  useEffect(() => {
    let live = true;
    void needsDiscoverHint(storage).then(value => { if (live) setShowHint(value); }).catch(() => {});
    return () => { live = false; cancelAnimation(offset); };
  }, [offset, storage]);
  useEffect(() => {
    if (reduce || !showHint || wiggleDone.current) return;
    wiggleDone.current = true;
    offset.value = withSequence(withTiming(-12, { duration: 120 }), withTiming(12, { duration: 200 }), withTiming(0, { duration: 140 }));
    return () => cancelAnimation(offset);
  }, [offset, reduce, showHint]);

  async function choose(decision: Decision) {
    setShowHint(false);
    void rememberDiscoverSwipe(storage).catch(() => {});
    onError('');
    try { await weekChoices.choose(event, decision); }
    catch {
      leaving.value = false;
      offset.value = reduce ? 0 : withSpring(0);
      onError('Could not save your choice. Try again.');
    }
  }
  const gesture = usePanGesture({
    activeOffsetX: [-12, 12], failOffsetY: [-16, 16],
    onActivate: () => { 'worklet'; if (!leaving.value) cancelAnimation(offset); },
    onUpdate: e => { 'worklet'; if (!leaving.value) offset.value = e.translationX; },
    onDeactivate: e => {
      'worklet';
      if (leaving.value) return;
      const decision = swipeDecision(e.translationX, width - 40, e.canceled);
      if (!decision) { offset.value = reduce ? 0 : withSpring(0, { damping: 18, stiffness: 190 }); return; }
      leaving.value = true;
      scheduleOnRN(haptic, 'selection');
      if (reduce) { scheduleOnRN(choose, decision); return; }
      offset.value = withTiming(decision === 'save' ? width : -width, { duration: 180 }, finished => {
        if (finished) scheduleOnRN(choose, decision);
      });
    },
  });
  const position = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }, { rotate: `${reduce ? 0 : 8 * offset.value / width}deg` }],
  }));
  const saveStamp = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, offset.value / (width / 3))) }));
  const skipStamp = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, -offset.value / (width / 3))) }));
  return <GestureDetector gesture={gesture}>
    <Animated.View style={[styles.frame, position]}>
      <PressScale style={styles.card} onPress={onOpen} accessibilityRole="button" accessibilityLabel={event.title}
        accessibilityHint="Opens event. Swipe right to save or left to skip."
        accessibilityActions={[{ name: 'save', label: 'Save event' }, { name: 'skip', label: 'Skip event' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (leaving.value || !['save', 'skip'].includes(nativeEvent.actionName)) return;
          leaving.value = true;
          haptic('selection');
          void choose(nativeEvent.actionName as Decision);
        }}>
        <ScrollView style={styles.contentScroll} contentContainerStyle={styles.content} bounces={false}
          showsVerticalScrollIndicator={false} directionalLockEnabled>
          <View style={styles.top}>
            <Text style={styles.category}>{categoryLabel(event.category)}</Text>
            <Text style={text.largeTitle} numberOfLines={3} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.7}>{event.title}</Text>
            <Text style={text.subhead} numberOfLines={1} ellipsizeMode="tail">{event.organizer}</Text>
          </View>
          <DiscoverArtwork category={event.category} fill />
          <View style={styles.bottom}>
            <Text style={styles.description} numberOfLines={3} ellipsizeMode="tail">{event.description}</Text>
            <View style={styles.facts}>
              <Text style={[text.headline, text.figures]} numberOfLines={2}>{et.dateTime(event.startsAt)}</Text>
              <Text style={text.subhead} numberOfLines={2} ellipsizeMode="tail">{buildingName(event.location.buildingId)}, {roomLabel(event.location.room)}</Text>
              {showHint ? <Text style={styles.hint}>Swipe right to save, left to skip</Text> : null}
            </View>
          </View>
        </ScrollView>
      </PressScale>
      <Animated.Text pointerEvents="none" style={[styles.stamp, styles.save, saveStamp]}>SAVE</Animated.Text>
      <Animated.Text pointerEvents="none" style={[styles.stamp, styles.skip, skipStamp]}>SKIP</Animated.Text>
    </Animated.View>
  </GestureDetector>;
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  card: { flex: 1, minHeight: 0, backgroundColor: tone.surface, borderRadius: radius.sheet, padding: space.xl,
    borderWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline, borderTopWidth: 4, borderTopColor: tone.gold },
  contentScroll: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1 },
  top: { gap: space.s, marginBottom: space.l },
  bottom: { gap: space.l, marginTop: space.l },
  category: { ...text.footnote, color: tone.amber, fontWeight: '600' },
  description: { ...text.body },
  facts: { gap: space.s, paddingTop: space.l, borderTopWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  hint: { ...text.footnote, textAlign: 'center', paddingTop: space.s },
  stamp: { position: 'absolute', top: space.xl, fontSize: 34, fontWeight: '800', letterSpacing: 2, borderWidth: 3,
    borderRadius: radius.control, paddingHorizontal: space.l, paddingVertical: space.s, backgroundColor: tone.paper },
  save: { left: space.xl, color: tone.amber, borderColor: tone.gold, transform: [{ rotate: '-12deg' }] },
  skip: { right: space.xl, color: tone.danger, borderColor: tone.danger, transform: [{ rotate: '12deg' }] },
});
