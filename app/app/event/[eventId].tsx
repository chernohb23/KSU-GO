import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Event } from '../../../shared/types';
import { useAccount } from '../../src/account/AccountProvider';
import { useAppData } from '../../src/data/AppDataContext';
import { EventDetails } from '../../src/events/EventDetails';
import { space, text, tone } from '../../src/navigation/theme';
import { Notice } from '../../src/ui/controls';

export default function EventScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { weekEvents, offline } = useAppData();
  const { api, registrations } = useAccount();
  const [fresh, setFresh] = useState<Event | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!api || offline) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    void api.getEvent(eventId).then((event) => { if (active) setFresh(event); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not refresh this event.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, eventId, offline]));
  // Cancelled and older registered events are deliberately absent from the weekly list.
  const event = (fresh?.id === eventId ? fresh : null)
    ?? registrations?.find((item) => item.event.id === eventId)?.event
    ?? weekEvents.find((item) => item.id === eventId);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Notice message={error} />
      {event ? (
        <EventDetails key={event.id} event={event}
          onTakeMeThere={(routeId) => router.push({ pathname: '/route/[routeId]', params: { routeId } })} />
      ) : (
        <View style={styles.missing}>
          <Text style={text.title}>{loading ? 'Loading event…' : 'This event is unavailable'}</Text>
          <Text style={text.subhead}>Older and cancelled events need the server. Events shows everything active this week.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tone.paper },
  content: { padding: space.gutter, paddingBottom: space.xxl },
  missing: { gap: space.s, paddingTop: space.l },
});
