import { palette } from '../../src/navigation/Brand';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Event } from '../../../shared/types';
import { useAppData } from '../../src/data/AppDataContext';
import { Action, buildingName } from '../../src/organizer/ui';
import { rankDeck, swipeDecision, type Decision } from '../../src/week/choices';
import { useDemoSession } from '../../src/settings/DemoSession';
import { useWeekChoices } from '../../src/week/useWeekChoices';

const eventTime = (iso: string) => new Date(iso).toLocaleString(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

function EventCard({ event, onError }: { event: Event; onError(message: string): void }) {
  const { weekChoices } = useDemoSession();
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
    <View style={styles.section}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.card, position]}>
          <Text style={styles.category}>{event.category}</Text>
          <Text accessibilityRole="header" style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.organizer}>{event.organizer}</Text>
          <Text style={styles.description}>{event.description}</Text>
          <View style={styles.details}>
            <Text style={styles.when}>{eventTime(event.startsAt)}</Text>
            <Text style={styles.body}>{buildingName(event.location.buildingId)} · {event.location.room}</Text>
          </View>
        </Animated.View>
      </GestureDetector>
      <Text style={styles.hint}>Swipe left to skip or right to save.</Text>
      <View style={styles.actions}>
        <View style={styles.action}><Action label="Skip" secondary onPress={() => void choose('skip')} /></View>
        <View style={styles.action}><Action label="Save" onPress={() => void choose('save')} /></View>
      </View>
    </View>
  );
}

export default function WeekScreen() {
  const { weekChoices } = useDemoSession();
  const { weekEvents } = useAppData();
  const { choices, loadFailed, retry } = useWeekChoices();
  const [view, setView] = useState<'deck' | 'saved'>('deck');
  const [error, setError] = useState('');
  const remaining = rankDeck(weekEvents, choices ?? []);
  const saved = (choices ?? []).flatMap(choice => {
    if (!choice.saved) return [];
    const current = weekEvents.find(event => event.id === choice.id);
    return [{ id: choice.id, title: current?.title ?? choice.saved.title,
      startsAt: current?.startsAt ?? choice.saved.startsAt, organizer: current?.organizer ?? choice.organizer }];
  }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  async function remove(id: string) {
    setError('');
    try { await weekChoices.remove(id); }
    catch { setError('Could not remove the event. Try again.'); }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>This week</Text>
      <View style={styles.actions}>
        {(['deck', 'saved'] as const).map(tab => (
          <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: view === tab }}
            onPress={() => { setError(''); setView(tab); }} style={[styles.tab, view === tab && styles.selected]}>
            <Text style={[styles.tabText, view === tab && styles.selectedText]}>
              {tab === 'deck' ? 'Discover' : `Saved (${saved.length})`}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {choices === null ? (
        loadFailed ? <Action label="Retry loading your choices" onPress={retry} />
          : <Text style={styles.body}>Loading your choices…</Text>
      ) : view === 'deck' ? (
        remaining.length ? <EventCard key={remaining[0].id} event={remaining[0]} onError={setError} />
          : <Text style={styles.body}>{weekEvents.length ? 'You’ve seen every event this week.' : 'No events this week.'}</Text>
      ) : saved.length ? saved.map(event => (
        <View key={event.id} style={styles.savedCard}>
          <Text style={styles.savedTitle}>{event.title}</Text>
          <Text style={styles.body}>{event.organizer}</Text>
          <Text style={styles.when}>{eventTime(event.startsAt)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${event.title} from Saved`}
            onPress={() => void remove(event.id)} style={styles.remove}>
            <Text style={styles.tabText}>Remove</Text>
          </Pressable>
        </View>
      )) : <Text style={styles.body}>Events you save will appear here.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.paper },
  content: { padding: 20, paddingBottom: 40, gap: 18 },
  section: { gap: 14 },
  title: { color: palette.ink, fontSize: 30, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  tab: { paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', borderRadius: 22 },
  selected: { backgroundColor: palette.ink },
  tabText: { color: '#634700', fontWeight: '700', fontSize: 15 },
  selectedText: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 22, gap: 10, borderColor: '#d5dde1', borderWidth: 1, borderTopColor: '#c49a39', borderTopWidth: 5 },
  category: { color: '#775709', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12 },
  eventTitle: { color: palette.ink, fontSize: 29, lineHeight: 34, fontWeight: '700' },
  organizer: { color: '#43515c', fontWeight: '600', fontSize: 16 },
  description: { color: '#263740', marginVertical: 9, lineHeight: 23, fontSize: 16 },
  details: { borderTopWidth: 1, borderColor: '#e3e7e9', paddingTop: 14, gap: 4 },
  when: { color: palette.ink, fontSize: 15, fontWeight: '600' },
  body: { color: '#43515c', fontSize: 15, lineHeight: 22 },
  hint: { textAlign: 'center', color: palette.muted, fontSize: 14 },
  savedCard: { padding: 16, gap: 6, borderRadius: 12, borderWidth: 1, borderColor: '#d5dde1', backgroundColor: '#fff' },
  savedTitle: { color: palette.ink, fontSize: 20, fontWeight: '700' },
  remove: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: 12 },
  error: { color: '#7a3225' },
});
