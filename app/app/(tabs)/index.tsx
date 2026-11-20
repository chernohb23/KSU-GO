import { haptic } from '../../src/ui/haptics';
import { ScreenScrollView as ScrollView } from '../../src/ui/ScreenScrollView';
import { PressScale } from '../../src/ui/PressScale';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import campusFixture from '../../../shared/fixtures/campus.json';
import type { Campus, Event } from '../../../shared/types.ts';
import { useAppData } from '../../src/data/AppDataContext';
import { getEventFlagState } from '../../src/data/events';
import { EventDetails, roomLabel } from '../../src/events/EventDetails';
import { et } from '../../src/events/format';
import { mapSheetVisible } from '../../src/navigation/access';
import { space, text, tone } from '../../src/navigation/theme';
import { AppTitle } from '../../src/navigation/AppHeader';
import { DockSpaceContext, useDockClearance } from '../../src/navigation/DockSpace';
import { Ionicon } from '../../src/ui/Ionicon';
import { GlassBackground } from '../../src/ui/GlassBackground';
import { useReduceMotion } from '../../src/ui/accessibility';
import { ViewerWebView, type ViewerWebViewHandle } from '../../src/viewer/ViewerWebView';
import type { ViewerToAppMessage } from '../../src/viewer/bridge';
import { LaunchScreen } from '../../src/navigation/Brand';
import { useWeekChoices } from '../../src/week/useWeekChoices';
import { viewerHtml } from '../../src/viewerHtml';

const campus = campusFixture as Campus;

export default function MapScreen() {
  const router = useRouter();
  const viewer = useRef<ViewerWebViewHandle>(null);
  const focused = useIsFocused();
  const { events, now, refresh, offline } = useAppData();
  const clearance = useDockClearance();
  const safe = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [legendOpen, setLegendOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  // Local HTML presentation settings keep label exclusions aligned with native controls.
  const mapSource = useMemo(() => ({ html: viewerHtml.replace('<head>', `<head><style>:root {
    --map-control-top: ${safe.top + space.l}px;
    --map-control-left: ${safe.left + space.gutter}px;
    --map-control-right: ${safe.right + space.gutter}px;
    --map-control-clearance: ${clearance}px;
  }</style>`) }), [safe.top, safe.left, safe.right, clearance]);

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
    router.push({ pathname: '/route/[routeId]', params: { routeId, eventId: selectedEvent?.id } });
  };

  const timeLabel = (event: Event) => getEventFlagState(event, now) === 'live'
    ? 'Happening now'
    : et.when(event.startsAt, now);

  return (
    <View style={styles.screen}>
      {focused ? <StatusBar style="dark" /> : null}
      <View style={styles.map}>
        <ViewerWebView
          ref={viewer}
          source={mapSource}
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
      <View pointerEvents="box-none" style={[styles.topControls, {
        top: safe.top + space.l, left: safe.left + space.gutter, right: safe.right + space.gutter,
      }]}>
        <View style={styles.logoGroup}>
          <PressScale accessibilityRole="button" accessibilityLabel="KSU GO" accessibilityHint="Long-press to open settings"
            onLongPress={() => router.push('/settings')} style={[styles.glass, styles.logoBubble]}>
            <GlassBackground />
            <AppTitle compact />
          </PressScale>
          {offline ? <PressScale accessibilityRole="button" accessibilityLabel="Offline. Open map information"
            onPress={() => setLegendOpen(true)} style={[styles.glass, styles.offlineBubble]}>
            <GlassBackground />
            <Text style={styles.offlineText} numberOfLines={1} maxFontSizeMultiplier={1.2}>Offline</Text>
          </PressScale> : null}
        </View>
        <View style={styles.actions}>
          <PressScale accessibilityRole="button" accessibilityLabel="Refresh events" accessibilityState={{ busy: refreshing }} disabled={refreshing}
            onPress={() => { setRefreshing(true); void refresh().finally(() => setRefreshing(false)); }} style={[styles.glass, styles.iconButton]}>
            <GlassBackground />
            <Ionicon name="refresh" color={tone.ink} size={20} />
          </PressScale>
          <PressScale accessibilityRole="button" accessibilityLabel="Map information" onPress={() => setLegendOpen(true)} style={[styles.glass, styles.iconButton]}>
            <GlassBackground />
            <Ionicon name="information-circle" color={tone.ink} size={20} />
          </PressScale>
        </View>
      </View>
      <View pointerEvents="box-none" style={[styles.bottomControls, {
        bottom: clearance + space.s, left: safe.left + space.gutter, right: safe.right + space.gutter,
      }]}>
        <PressScale accessibilityRole="button" onPress={() => setListOpen(true)} style={[styles.glass, styles.eventsButton]}>
          <GlassBackground />
          <Text style={text.headline} numberOfLines={1}>Today’s events</Text>
        </PressScale>
      </View>
      {campus.attribution ? <Text pointerEvents="none" style={[styles.credit, {
        bottom: clearance - space.l, right: safe.right + space.gutter,
      }]}>© OpenStreetMap</Text> : null}

      <Modal visible={legendOpen} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setLegendOpen(false)}>
        <DockSpaceContext.Provider value={0}>
          <View style={styles.modalRoot}>
            <PressScale accessibilityLabel="Close legend" onPress={() => setLegendOpen(false)} style={styles.backdrop} scaleEffect={false} feedback={false} />
            <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} accessibilityViewIsModal bounces={false}>
              <View style={styles.infoHeader}>
                <Text style={text.title}>Map information</Text>
                <PressScale accessibilityRole="button" accessibilityLabel="Close map information" onPress={() => setLegendOpen(false)} style={styles.iconButton}>
                  <Ionicon name="close" size={22} color={tone.ink} />
                </PressScale>
              </View>
              <View style={styles.legend}>
                {([['#ff8672', 'Live'], ['#f3c66e', 'Within 1 hour'], ['#9ab9e9', 'Later']] as const).map(([color, label]) =>
                  <View key={label} style={styles.legendRow}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={text.body}>{label}</Text></View>)}
                <Text style={text.subhead}>Taller flags start sooner.</Text>
                <View style={styles.legendRow}><Ionicon name="star" size={16} color={tone.amber} /><Text style={text.subhead}>Saved event</Text></View>
                {campus.attribution ? <Text style={text.footnote}>Map data © OpenStreetMap contributors</Text> : null}
              </View>
            </ScrollView>
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
  topControls: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
  logoGroup: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexShrink: 1 },
  glass: { borderRadius: 999, shadowColor: tone.ink, shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  logoBubble: { height: 40, paddingHorizontal: space.s, justifyContent: 'center', flexShrink: 1 },
  offlineBubble: { height: 28, paddingHorizontal: space.s, justifyContent: 'center' },
  offlineText: { ...text.footnote, color: tone.ink, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: space.s },
  bottomControls: { position: 'absolute', alignItems: 'flex-end' },
  eventsButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.l, maxWidth: '100%' },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  credit: { position: 'absolute', textAlign: 'right', color: tone.muted, fontSize: 11, lineHeight: 14 },
  infoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.l },
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
