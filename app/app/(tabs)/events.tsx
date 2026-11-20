import { DiscoverCard } from '../../src/week/DiscoverCard';
import { useDockClearance } from '../../src/navigation/DockSpace';
import { ScreenScrollView as ScrollView } from '../../src/ui/ScreenScrollView';
import { PressScale } from '../../src/ui/PressScale';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import type { Event } from '../../../shared/types';
import { useAccount } from '../../src/account/AccountProvider';
import { useAppData } from '../../src/data/AppDataContext';
import { getEventFlagState } from '../../src/data/events';
import { roomLabel } from '../../src/events/EventDetails';
import { et } from '../../src/events/format';
import { SavedEventRow, savedListStyles } from '../../src/events/SavedEventRow';
import { space, text, tone } from '../../src/navigation/theme';
import { buildingName } from '../../src/organizer/ui';
import { rankDeck } from '../../src/week/choices';
import { useWeekChoices } from '../../src/week/useWeekChoices';

type View_ = 'all' | 'discover' | 'saved';
const SEGMENTS: { key: View_; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'discover', label: 'Discover' }, { key: 'saved', label: 'Saved' },
];

function Segmented({ value, onChange, savedCount }: { value: View_; onChange(next: View_): void; savedCount: number }) {
  return (
    <View accessibilityRole="tablist" style={styles.segmented}>
      {SEGMENTS.map(({ key, label }) => {
        const selected = value === key;
        return (
          <PressScale key={key} feedback={selected ? false : 'selection'} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(key)}
            style={[styles.segment, selected && styles.segmentSelected]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {key === 'saved' && savedCount ? `${label} ${savedCount}` : label}
            </Text>
          </PressScale>
        );
      })}
    </View>
  );
}

/** A schedule row: the campus time on the left, the event on the right. */
function EventRow({ event, now, onPress }: { event: Event; now: Date; onPress(): void }) {
  const live = getEventFlagState(event, now) === 'live';
  return (
    <PressScale accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rail}>
        <Text style={[styles.railTime, text.figures]}>{et.time(event.startsAt)}</Text>
        {live ? <Text style={styles.live}>Now</Text> : null}
      </View>
      <View style={styles.rowBody}>
        <Text style={text.headline} numberOfLines={2}>{event.title}</Text>
        <Text style={text.subhead} numberOfLines={1}>{event.organizer}</Text>
        <Text style={text.footnote} numberOfLines={1}>
          {buildingName(event.location.buildingId)}, {roomLabel(event.location.room)}
        </Text>
      </View>
    </PressScale>
  );
}


function Empty({ title }: { title: string }) {
  return (
    <View style={styles.empty}>
      <Text style={text.headline}>{title}</Text>
    </View>
  );
}

export default function EventsScreen() {
  const router = useRouter();
  const { weekChoices, accountId } = useAccount();
  const clearance = useDockClearance();
  const { weekEvents, now } = useAppData();
  const { choices, loadFailed, retry } = useWeekChoices();
  const [view, setView] = useState<View_>('all');
  const [error, setError] = useState('');
  const open = (id: string) => router.push({ pathname: '/event/[eventId]', params: { eventId: id } });

  const savedIds = new Set((choices ?? []).filter((choice) => choice.saved).map((choice) => choice.id));
  const saved = weekEvents.filter((event) => savedIds.has(event.id));
  const remaining = rankDeck(weekEvents, choices ?? []);

  async function unsave(id: string) {
    setError('');
    try { await weekChoices.remove(id); } catch { setError('Could not remove the event. Try again.'); }
  }

  const header = (
    <View style={styles.header}>
      <Segmented value={view} onChange={(next) => { setError(''); setView(next); }} savedCount={saved.length} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );

  if (view === 'all') {
    return (
      <SectionList
        style={styles.screen}
        contentContainerStyle={[styles.listContent, { paddingBottom: clearance }]}
        sections={et.sections(weekEvents, now)}
        keyExtractor={(event) => event.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={text.footnote}>ET</Text>
          </View>
        )}
        renderItem={({ item }) => <EventRow event={item} now={now} onPress={() => open(item.id)} />}
        ListEmptyComponent={<Empty title="No events this week" />}
      />
    );
  }

  if (view === 'discover') return (
    <View style={styles.screen}>
      {header}
      <View style={[styles.discoverBody, { paddingBottom: clearance }]}>
        {choices === null ? loadFailed
          ? <PressScale onPress={retry} style={styles.retry}><Text style={text.headline}>Retry</Text></PressScale>
          : <Text style={text.subhead}>Loading…</Text>
          : remaining.length ? <DiscoverCard key={accountId + ':' + remaining[0].id} event={remaining[0]}
              onError={setError} onOpen={() => open(remaining[0].id)} />
          : <Empty title={weekEvents.length ? 'You’re all caught up' : 'No events this week'} />}
      </View>
    </View>
  );
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.listContent}>
      {header}
      <View style={styles.body}>
        {choices === null ? loadFailed
          ? <PressScale accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={text.headline}>Retry saved events</Text></PressScale>
          : <Text style={text.subhead}>Loading…</Text>
          : saved.length ? <View style={savedListStyles.group}>{saved.map((event, index) => (
            <SavedEventRow key={event.id} title={event.title} startsAt={event.startsAt} now={now}
              last={index === saved.length - 1} onPress={() => open(event.id)} onRemove={() => unsave(event.id)} />
          ))}</View> : <Empty title="No saved events" />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tone.paper },
  listContent: { paddingBottom: space.xxl },
  header: { paddingHorizontal: space.gutter, paddingTop: space.s, paddingBottom: space.l, gap: space.l },
  body: { paddingHorizontal: space.gutter },
  segmented: { flexDirection: 'row', padding: 2, borderRadius: 9, backgroundColor: tone.fill },
  segment: { flex: 1, minHeight: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: tone.surface, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { ...text.subhead, color: tone.ink, fontWeight: '500' },
  segmentTextSelected: { fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: space.gutter, paddingTop: space.m, paddingBottom: space.s, backgroundColor: tone.paper },
  sectionTitle: { ...text.headline, color: tone.amber },
  row: { flexDirection: 'row', gap: space.l, paddingHorizontal: space.gutter, paddingVertical: space.m },
  rowPressed: { opacity: 0.6 },
  rail: { width: 76, alignItems: 'flex-end', paddingTop: 1 },
  railTime: { ...text.subhead, color: tone.ink, fontWeight: '600' },
  live: { ...text.footnote, color: tone.amber, fontWeight: '700' },
  rowBody: { flex: 1, gap: 2, paddingBottom: space.m, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  discoverBody: { flex: 1, paddingHorizontal: space.gutter },
  empty: { alignItems: 'center', gap: space.s, paddingVertical: space.xxl, paddingHorizontal: space.gutter },
  retry: { minHeight: 44, justifyContent: 'center' },
  error: { ...text.footnote, color: tone.error },
});
