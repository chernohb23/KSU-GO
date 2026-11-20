import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import campusFixture from '../../../shared/fixtures/campus.json';
import type { Campus, Event } from '../../../shared/types.ts';
import { useAppData } from '../../src/data/AppDataContext';
import { getEventFlagState } from '../../src/data/events';
import { EventDetails, roomLabel } from '../../src/events/EventDetails';
import { et } from '../../src/events/format';
import { mapSheetVisible } from '../../src/navigation/access';
import { text, tone } from '../../src/navigation/theme';
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
    if (message.type === 'campus:flagTapped') selectEvent(message.eventId);
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
      <Pressable accessibilityRole="button" onPress={() => setListOpen(true)} style={styles.eventsButton}>
        <Text style={styles.eventsButtonText}>Today’s events</Text>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.refresh}>
        <Text style={styles.refreshText}>Refresh events</Text>
      </Pressable>

      <Modal
        visible={sheetVisible}
        animationType="slide"
        transparent
        onRequestClose={closeSheet}
      >
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="Close" onPress={closeSheet} style={styles.backdrop} />
          {listOpen ? (
            <View accessibilityViewIsModal style={[styles.sheet, styles.sheetContent]}>
              <View style={styles.grabber} />
              <Text accessibilityRole="header" style={text.title}>Today’s events</Text>
              <ScrollView>
                {events.map(event => (
                  <Pressable key={event.id} accessibilityRole="button" style={styles.listItem}
                    onPress={() => selectEvent(event.id)}>
                    <Text style={text.headline}>{event.title}</Text>
                    <Text style={[text.subhead, text.figures]}>{timeLabel(event)}</Text>
                    <Text style={text.subhead}>{roomLabel(event.location.room)}</Text>
                  </Pressable>
                ))}
                {events.length === 0 && <Text style={text.subhead}>There are no events in the next 24 hours.</Text>}
              </ScrollView>
            </View>
          ) : selectedEvent ? (
            <ScrollView accessibilityViewIsModal style={styles.sheet} contentContainerStyle={styles.sheetContent}>
              <View style={styles.grabber} />
              <EventDetails event={selectedEvent} onTakeMeThere={takeMeThere} />
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101820' },
  map: { flex: 1 },
  mapError: { position: 'absolute', alignSelf: 'center', top: '45%', color: '#fff', backgroundColor: '#a52b22', padding: 10, borderRadius: 8 },
  refresh: { position: 'absolute', top: 12, right: 12, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#ffffffed' },
  refreshText: { color: palette.ink, fontWeight: '700', fontSize: 12 },
  eventsButton: { position: 'absolute', top: 12, left: 12, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: palette.gold },
  eventsButtonText: { color: palette.ink, fontWeight: '700', fontSize: 12 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#0008' },
  listItem: { paddingVertical: 12, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: tone.paper },
  sheetContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, marginBottom: 16, backgroundColor: '#c5ccd0' },
});
