import { PressScale } from '../ui/PressScale';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { radius, space, text, tone } from '../navigation/theme';
import { et } from './format';

/** The same saved row in Profile and Events, with a left swipe and VoiceOver action. */
export function SavedEventRow({ title, startsAt, now, onPress, onRemove, last = false }: {
  title: string; startsAt: string; now: Date; onPress(): void; onRemove(): Promise<void>; last?: boolean;
}) {
  const swipeable = useRef<SwipeableMethods>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  async function remove() {
    if (busy) return;
    setBusy(true);
    try { await onRemove(); } finally { setBusy(false); swipeable.current?.close(); }
  }
  return (
    <ReanimatedSwipeable ref={swipeable} overshootRight={false} rightThreshold={40}
      onSwipeableOpen={() => setOpen(true)} onSwipeableClose={() => setOpen(false)}
      renderRightActions={() => (
        <PressScale accessibilityRole="button" accessibilityLabel={`Remove ${title} from Saved`}
          accessibilityElementsHidden={!open} importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
          disabled={busy} onPress={() => void remove()} style={styles.remove}>
          <Text style={styles.removeText}>Remove</Text>
        </PressScale>
      )}>
      <PressScale accessibilityRole="button" accessibilityLabel={`${title}, ${et.when(startsAt, now)}`}
        accessibilityActions={[{ name: 'remove', label: 'Remove from Saved' }]}
        onAccessibilityAction={({ nativeEvent }) => { if (nativeEvent.actionName === 'remove') void remove(); }}
        onPress={onPress} style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <View style={[styles.body, !last && styles.divider]}>
          <Text style={text.headline} numberOfLines={2}>{title}</Text>
          <Text style={[text.subhead, text.figures]}>{et.when(startsAt, now)}</Text>
        </View>
      </PressScale>
    </ReanimatedSwipeable>
  );
}

export const savedListStyles = StyleSheet.create({
  group: { backgroundColor: tone.surface, borderRadius: radius.group, overflow: 'hidden' },
});

const styles = StyleSheet.create({
  main: { backgroundColor: tone.surface, paddingLeft: space.l },
  body: { minHeight: 80, justifyContent: 'center', gap: space.xs, paddingVertical: space.m, paddingRight: space.l },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  remove: { width: 88, alignItems: 'center', justifyContent: 'center', backgroundColor: tone.danger },
  removeText: { ...text.headline, color: tone.surface },
  pressed: { opacity: 0.65 },
});
