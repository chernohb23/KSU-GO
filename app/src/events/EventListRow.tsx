import { PressScale } from '../ui/PressScale';
import { StyleSheet, Text, View } from 'react-native';

import type { Event } from '../../../shared/types.ts';
import { space, text, tone } from '../navigation/theme';
import { roomLabel } from '../../../shared/rooms.ts';
import { buildingName } from '../organizer/ui';
import { et } from './format';
import { Ionicon } from '../ui/Ionicon';

/** One event in a grouped list: title, campus time, place, and a Cancelled label when it is. */
export function EventListRow({ event, now, onPress, last = false, trailing }: {
  event: Event; now: Date; onPress(): void; last?: boolean; trailing?: string;
}) {
  const cancelled = event.status === 'cancelled';
  return (
    <PressScale accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}>
      <View style={styles.body}>
        <Text style={[text.headline, cancelled && styles.struck]} numberOfLines={2}>{event.title}</Text>
        <Text style={[text.subhead, text.figures]} numberOfLines={1}>{et.when(event.startsAt, now)}</Text>
        <Text style={text.footnote} numberOfLines={1}>
          {buildingName(event.location.buildingId)}, {roomLabel(event.location.room)}
        </Text>
      </View>
      {cancelled ? <Text style={styles.cancelled}>Cancelled</Text>
        : trailing ? <Text style={[text.subhead, text.figures]}>{trailing}</Text> : null}
      <Ionicon name="chevron-forward" size={18} />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, paddingRight: space.l },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  body: { flex: 1, gap: 2 },
  struck: { color: tone.muted },
  cancelled: { ...text.footnote, color: tone.danger, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
