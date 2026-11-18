import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppData } from '../src/data/AppDataContext';
import { getEventFlagState } from '../src/data/events';

export default function MapScreen() {
  const { events, now, source, refresh } = useAppData();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.title}>Campus events</Text>
        <Text accessibilityRole="button" onPress={() => void refresh()} style={styles.refresh}>Refresh</Text>
      </View>
      {source === 'fixtures' && events.length === 0 ? <Text style={styles.empty}>No upcoming events in the fixture window.</Text> : null}
      {events.map((event) => {
        const state = getEventFlagState(event, now);
        const minutesUntilStart = Math.max(0, Math.ceil((Date.parse(event.startsAt) - now.getTime()) / 60_000));
        const status = state === 'live' ? 'Live now' : state === 'soon' ? `Starts in ${minutesUntilStart} min` : state === 'later' ? 'Later' : 'Ended';
        return (
          <View key={event.id} style={styles.eventCard}>
            <View style={styles.eventHeading}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={[styles.status, state === 'live' ? styles.live : state === 'soon' ? styles.soon : styles.later]}>{status}</Text>
            </View>
            <Text style={styles.detail}>{event.organizer} · {event.category}</Text>
            <Text style={styles.detail}>{new Date(event.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {event.location.buildingId} · Room {event.location.room}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: '#f5f7f8', flexGrow: 1 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#17212a', fontSize: 24, fontWeight: '700' },
  refresh: { color: '#805b08', fontWeight: '700', padding: 8 },
  empty: { color: '#53616c', marginTop: 20 },
  eventCard: { marginTop: 12, borderRadius: 10, padding: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e5e8' },
  eventHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  eventTitle: { flex: 1, color: '#17212a', fontSize: 16, fontWeight: '700' },
  status: { fontSize: 12, fontWeight: '700' },
  live: { color: '#b23d32' },
  soon: { color: '#9a6900' },
  later: { color: '#526b80' },
  detail: { color: '#53616c', marginTop: 5, fontSize: 13 },
});
