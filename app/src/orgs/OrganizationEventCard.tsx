import { PressScale } from '../ui/PressScale';
import { StyleSheet, Text, View } from 'react-native';

import { roomLabel } from '../../../shared/rooms';
import type { Event } from '../../../shared/types';
import { et } from '../events/format';
import { radius, space, text, tone } from '../navigation/theme';
import { buildingName } from '../organizer/ui';

export function OrganizationEventCard({ event, onPress }: { event: Event; onPress(): void }) {
  const date = et.dateBlock(event.startsAt);
  const cancelled = event.status === 'cancelled';
  return <PressScale accessibilityRole="button"
    accessibilityLabel={`${event.title}, ${et.dateTime(event.startsAt)}, ${roomLabel(event.location.room)}${cancelled ? ', Cancelled' : ''}`}
    onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <View style={styles.date}>
      <Text style={[text.largeTitle, text.figures, cancelled && styles.muted]}>{date.day}</Text>
      <Text style={text.footnote}>{date.month}</Text>
    </View>
    <View style={styles.body}>
      <Text style={[text.headline, cancelled && styles.muted]} numberOfLines={2}>{event.title}</Text>
      <Text style={[text.subhead, text.figures]}>{et.time(event.startsAt)} ET{cancelled ? ' · Cancelled' : ''}</Text>
      <Text style={text.footnote} numberOfLines={2}>{buildingName(event.location.buildingId)}, {roomLabel(event.location.room)}</Text>
    </View>
  </PressScale>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.l, padding: space.l, borderRadius: radius.group, backgroundColor: tone.surface },
  date: { width: 56, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: space.xs },
  muted: { color: tone.muted },
  pressed: { opacity: 0.65 },
});
