import { haptic } from '../../src/ui/haptics';
import { ScreenScrollView as ScrollView } from '../../src/ui/ScreenScrollView';
import { PressScale } from '../../src/ui/PressScale';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import campusFixture from '../../../shared/fixtures/campus.json';
import type { Campus, Event } from '../../../shared/types.ts';
import { useAppData } from '../../src/data/AppDataContext';
import { getEventFlagState } from '../../src/data/events';
import { EventDetails, roomLabel } from '../../src/events/EventDetails';
import { et } from '../../src/events/format';
import { mapSheetVisible } from '../../src/navigation/access';
import { radius, space, text, tone } from '../../src/navigation/theme';
import { DockSpaceContext, useDockClearance } from '../../src/navigation/DockSpace';
import { Ionicon } from '../../src/ui/Ionicon';
import { useReduceMotion } from '../../src/ui/accessibility';
import { ViewerWebView, type ViewerWebViewHandle } from '../../src/viewer/ViewerWebView';
import type { ViewerToAppMessage } from '../../src/viewer/bridge';
import { LaunchScreen, palette } from '../../src/navigation/Brand';
import { useWeekChoices } from '../../src/week/useWeekChoices';
import { viewerHtml } from '../../src/viewerHtml';

const campus = campusFixture as Campus;

export default function MapScreen() {
  const router = useRouter();
  const viewer = useRef<ViewerWebViewHandle>(null);
  const focused = useIsFocused();
  const { events, now, refresh } = useAppData();
  const clearance = useDockClearance();
  const reduceMotion = useReduceMotion();
  const [legendOpen, setLegendOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const { choices } = useWeekChoices();
  const initialMessage = useMemo(() => ({
    type: 'campus:load' as const,
    campus,
    events,
    now: now.toISOString(),
    savedEventIds: choices?.filter(choice => choice.saved).map(choice => choice.id) ?? [],
  }), [events, now, choices]);

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  // Hidden while the route screen covers the map; the selection stays, so Back reopens it.
  const sheetVisible = mapSheetVisible({ selected: selectedEvent !== null, listOpen, focused });

  const selectEvent = useCallback((eventId: string) => {
    if (!events.some((event) => event.id === eventId)) return;
    setListOpen(false);
    setSelectedEventId(eventId);
    viewer.current?.send({ type: 'campus:select', eventId });
  }, [events]);

  const handleViewerMessage = useCallback((message: ViewerToAppMessage) => {
    if (message.type === 'campus:flagTapped') { haptic('light'); selectEvent(message.eventId); }
    if (message.type === 'error') setMapError('The campus map could not be loaded. Open today’s events to find a room.');
  }, [selectEvent]);

  const closeSheet = () => {
    setListOpen(false);
    setSelectedEventId(null);
    viewer.current?.send({ type: 'campus:select', eventId: null });
  };

  const takeMeThere = (routeId: string) => {
    router.push({ pathname: '/route/[routeId]', params: { routeId } });
  };

  const timeLabel = (event: Event) => getEventFlagState(event, now) === 'live'
    ? 'Happening now'
    : et.when(event.startsAt, now);

  return (
    <View style={styles.screen}>
      <View style={styles.map}>
        <ViewerWebView
          ref={viewer}
          source={{ html: viewerHtml }}
          initialMessage={initialMessage}
          onMessage={handleViewerMessage}
          onReady={() => { setMapReady(true); setMapError(null); }}
          onError={() => setMapError('The campus map could not be loaded.')}
        />
        {mapError ? <Text accessibilityRole="alert" style={styles.mapError}>{mapError}</Text> : null}
      </View>

      {!mapReady && !mapError && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <LaunchScreen label="Opening campus map…" />
        </View>
      )}
      <View style={styles.toolbar}>
        <PressScale accessibilityRole="button" onPress={() => setListOpen(true)} style={styles.eventsButton}>
          <Text style={text.headline} numberOfLines={1}>Today’s events</Text>
        </PressScale>
        <PressScale accessibilityRole="button" accessibilityLabel="Refresh events" disabled={refreshing}
          onPress={() => { setRefreshing(true); void refresh().finally(() => setRefreshing(false)); }} style={styles.iconButton}>
          <Ionicon name="refresh" color={tone.ink} />
        </PressScale>
        <PressScale accessibilityRole="button" accessibilityLabel="Map legend" onPress={() => setLegendOpen(true)} style={styles.iconButton}>
          <Ionicon name="information-circle" color={tone.ink} />
        </PressScale>
      </View>
      {campus.attribution ? <Text pointerEvents="none" style={[styles.credit, { bottom: clearance }]}>{campus.attribution}</Text> : null}

      <Modal visible={legendOpen} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setLegendOpen(false)}>
        <DockSpaceContext.Provider value={0}>
          <View style={styles.modalRoot}>
            <PressScale accessibilityLabel="Close legend" onPress={() => setLegendOpen(false)} style={styles.backdrop} scaleEffect={false} feedback={false} />
            <View style={[styles.sheet, styles.sheetContent]} accessibilityViewIsModal>
              <Text style={text.title}>Map legend</Text>
              <View style={styles.legend}>
                {([['#ff8672', 'Live'], ['#f3c66e', 'Within 1 hour'], ['#9ab9e9', 'Later']] as const).map(([color, label]) =>
                  <View key={label} style={styles.legendRow}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={text.body}>{label}</Text></View>)}
                <Text style={text.subhead}>Taller flags start sooner.</Text>
                <Text style={text.subhead}>★ Saved event</Text>
              </View>
            </View>
          </View>
        </DockSpaceContext.Provider>
      </Modal>

      <Modal
        visible={sheetVisible}
        animationType={reduceMotion ? 'none' : 'slide'}
        transparent
        onRequestClose={closeSheet}
      >
        <DockSpaceContext.Provider value={0}>
        <View style={styles.modalRoot}>
          <PressScale accessibilityLabel="Close" onPress={closeSheet} style={styles.backdrop} scaleEffect={false} />
          {listOpen ? (
            <View accessibilityViewIsModal style={[styles.sheet, styles.sheetContent]}>
              <View style={styles.grabber} />
              <Text accessibilityRole="header" style={text.title}>Today’s events</Text>
              <ScrollView>
                {events.map(event => (
                  <PressScale key={event.id} accessibilityRole="button" style={styles.listItem}
                    onPress={() => selectEvent(event.id)}>
                    <Text style={text.headline}>{event.title}</Text>
                    <Text style={[text.subhead, text.figures]}>{timeLabel(event)}</Text>
                    <Text style={text.subhead}>{roomLabel(event.location.room)}</Text>
                  </PressScale>
                ))}
                {events.length === 0 && <Text style={text.subhead}>No events today.</Text>}
              </ScrollView>
            </View>
          ) : selectedEvent ? (
            <ScrollView accessibilityViewIsModal style={styles.sheet} contentContainerStyle={styles.sheetContent}>
              <View style={styles.grabber} />
              <EventDetails event={selectedEvent} onTakeMeThere={takeMeThere} />
            </ScrollView>
          ) : null}
        </View>
        </DockSpaceContext.Provider>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101820' },
  map: { flex: 1 },
  mapError: { position: 'absolute', alignSelf: 'center', top: '45%', color: '#fff', backgroundColor: '#a52b22', padding: 10, borderRadius: 8 },
  toolbar: { position: 'absolute', top: space.l, left: space.gutter, right: space.gutter, flexDirection: 'row', gap: space.s },
  eventsButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.l,
    borderRadius: radius.group, backgroundColor: tone.gold },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.group, backgroundColor: tone.paper },
  credit: { position: 'absolute', left: space.gutter, ...text.footnote, color: tone.ink, backgroundColor: '#f8f7f2e6',
    paddingHorizontal: space.s, paddingVertical: space.xs, borderRadius: 4 },
  legend: { paddingTop: space.l, gap: space.m },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  dot: { width: 12, height: 12, borderRadius: 6 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#0008' },
  listItem: { paddingVertical: 12, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: tone.paper },
  sheetContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, marginBottom: 16, backgroundColor: '#c5ccd0' },
});
