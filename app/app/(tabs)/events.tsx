import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Event } from '../../../shared/types';
import { useAccount } from '../../src/account/AccountProvider';
import { useAppData } from '../../src/data/AppDataContext';
import { getEventFlagState } from '../../src/data/events';
import { roomLabel } from '../../src/events/EventDetails';
import { et } from '../../src/events/format';
import { SavedEventRow, savedListStyles } from '../../src/events/SavedEventRow';
import { radius, space, text, tone } from '../../src/navigation/theme';
import { buildingName } from '../../src/organizer/ui';
import { rankDeck, swipeDecision, type Decision } from '../../src/week/choices';
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
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(key)}
            style={[styles.segment, selected && styles.segmentSelected]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {key === 'saved' && savedCount ? `${label} ${savedCount}` : label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A schedule row: the campus time on the left, the event on the right. */
function EventRow({ event, now, onPress }: { event: Event; now: Date; onPress(): void }) {
  const live = getEventFlagState(event, now) === 'live';
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
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
    </Pressable>
  );
}

function DiscoverCard({ event, onError, onOpen }: { event: Event; onError(message: string): void; onOpen(): void }) {
  const { weekChoices } = useAccount();
  const { now } = useAppData();
  const { width } = useWindowDimensions();
  const offset = useSharedValue(0);
  const leaving = useSharedValue(false);

  async function choose(decision: Decision) {
    onError('');
    try {
      await weekChoices.choose(event, decision);
    } catch {
      leaving.value = false;
      offset.value = withSpring(0);
      onError('Could not store your choice. Try again.');
    }
  }

  const gesture = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-16, 16],
    onUpdate: e => {
      'worklet';
      if (!leaving.value) offset.value = e.translationX;
    },
    onDeactivate: e => {
      'worklet';
      if (leaving.value) return;
      const decision = swipeDecision(e.translationX, width - 40, e.canceled);
      if (!decision) {
        offset.value = withSpring(0, { damping: 18, stiffness: 190 });
        return;
      }
      leaving.value = true;
      offset.value = withTiming(decision === 'save' ? width : -width, { duration: 140 }, finished => {
        if (finished) scheduleOnRN(choose, decision);
      });
    },
  });
  const position = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }, { rotate: `${8 * offset.value / width}deg` }],
  }));

  return (
    <View style={styles.discover}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.card, position]}>
          <Text style={styles.cardKind}>{event.category[0].toUpperCase() + event.category.slice(1)}</Text>
          <Text accessibilityRole="header" style={styles.cardTitle}>{event.title}</Text>
          <Text style={text.subhead}>{event.organizer}</Text>
          <Text style={styles.cardDescription} numberOfLines={5}>{event.description}</Text>
          <View style={styles.cardFacts}>
            <Text style={[text.headline, text.figures]}>{et.when(event.startsAt, now)}</Text>
            <Text style={text.subhead}>{buildingName(event.location.buildingId)}, {roomLabel(event.location.room)}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onOpen} hitSlop={8} style={styles.cardLink}>
            <Text style={styles.cardLinkText}>Details</Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>
      <Text style={styles.hint}>Swipe right to save, left to skip.</Text>
      <View style={styles.choices}>
        <Pressable accessibilityRole="button" onPress={() => void choose('skip')}
          style={({ pressed }) => [styles.choice, styles.skip, pressed && styles.rowPressed]}>
          <Text style={[text.headline, { color: tone.ink }]}>Skip</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void choose('save')}
          style={({ pressed }) => [styles.choice, styles.save, pressed && styles.rowPressed]}>
          <Text style={[text.headline, { color: tone.surface }]}>Save</Text>
        </Pressable>
      </View>
    </View>
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
  const { weekChoices } = useAccount();
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
      <Text accessibilityRole="header" style={text.largeTitle}>Events</Text>
      <Segmented value={view} onChange={(next) => { setError(''); setView(next); }} savedCount={saved.length} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );

  if (view === 'all') {
    return (
      <SectionList
        style={styles.screen}
        contentContainerStyle={styles.listContent}
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.listContent}>
      {header}
      <View style={styles.body}>
        {choices === null ? (
          loadFailed ? (
            <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}>
              <Text style={[text.headline, { color: tone.amber }]}>Retry loading your saved events</Text>
            </Pressable>
          ) : <Text style={text.subhead}>Loading your saved events…</Text>
        ) : view === 'discover' ? (
          remaining.length
            ? <DiscoverCard key={remaining[0].id} event={remaining[0]} onError={setError} onOpen={() => open(remaining[0].id)} />
            : <Empty title={weekEvents.length ? 'You’re all caught up' : 'No events this week'} />
        ) : saved.length ? (
          <View style={savedListStyles.group}>
            {saved.map((event, index) => (
              <SavedEventRow key={event.id} title={event.title} startsAt={event.startsAt} now={now}
                last={index === saved.length - 1} onPress={() => open(event.id)} onRemove={() => unsave(event.id)} />
            ))}
          </View>
        ) : (
          <Empty title="No saved events" />
        )}
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
  discover: { gap: space.l },
  card: { backgroundColor: tone.surface, borderRadius: 18, padding: space.xl, gap: space.s,
    borderWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline, borderTopWidth: 4, borderTopColor: tone.gold },
  cardKind: { ...text.footnote, color: tone.amber, fontWeight: '600' },
  cardTitle: { ...text.title, fontSize: 26, lineHeight: 32 },
  cardDescription: { ...text.body, color: '#2b3b42', marginVertical: space.s },
  cardFacts: { gap: 2, paddingTop: space.m, borderTopWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  cardLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  cardLinkText: { ...text.headline, color: tone.amber },
  hint: { ...text.footnote, textAlign: 'center' },
  choices: { flexDirection: 'row', gap: space.m },
  choice: { flex: 1, minHeight: 50, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  skip: { backgroundColor: tone.surface, borderWidth: 1, borderColor: tone.hairline },
  save: { backgroundColor: tone.amber },
  empty: { alignItems: 'center', gap: space.s, paddingVertical: space.xxl, paddingHorizontal: space.gutter },
  retry: { minHeight: 44, justifyContent: 'center' },
  error: { ...text.footnote, color: tone.error },
});
