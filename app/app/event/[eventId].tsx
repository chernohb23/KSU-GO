import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppData } from '../../src/data/AppDataContext';
import { EventDetails } from '../../src/events/EventDetails';
import { space, text, tone } from '../../src/navigation/theme';

export default function EventScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { weekEvents } = useAppData();
  const event = weekEvents.find((item) => item.id === eventId);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {event ? (
        <EventDetails event={event}
          onTakeMeThere={(routeId) => router.push({ pathname: '/route/[routeId]', params: { routeId } })} />
      ) : (
        <View style={styles.missing}>
          <Text style={text.title}>This event is no longer available</Text>
          <Text style={text.subhead}>It may have ended or been removed. Events shows everything this week.</Text>
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
