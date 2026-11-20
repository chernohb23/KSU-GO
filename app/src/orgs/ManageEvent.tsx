import { ScreenScrollView as ScrollView } from '../ui/ScreenScrollView';
import { PressScale } from '../ui/PressScale';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Modal, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { roomLabel } from '../../../shared/rooms';
import type { EventDirections, EventRegistrations } from '../../../shared/types';
import { useAppData } from '../data/AppDataContext';
import { EventDetails } from '../events/EventDetails';
import { et } from '../events/format';
import { space, text, tone } from '../navigation/theme';
import { ROUTE_POLL_MS } from '../organizer/session';
import { ProgressBar } from '../organizer/ui';
import { Button, Group, Notice, Row, Section, screenStyles } from '../ui/controls';
import { directionsRow } from './directions';
import { useManagedEvent } from './useManagedEvent';
import { Ionicon } from '../ui/Ionicon';

export default function ManageEvent() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { event, api, canManage, error, setEvent } = useManagedEvent(eventId);
  const { refresh, now, offline } = useAppData();
  const [details, setDetails] = useState<{ id: string; directions: EventDirections; registrations: EventRegistrations } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRegistrations, setShowRegistrations] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!api || !canManage) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const [directions, registrations] = await Promise.all([api.eventDirections(eventId), api.eventRegistrations(eventId)]);
        if (!active) return;
        setDetails({ id: eventId, directions, registrations });
        setProblem(null);
        if (directions.state === 'processing') timer = setTimeout(() => void load(), ROUTE_POLL_MS);
      } catch (cause) {
        if (active) setProblem(cause instanceof Error ? cause.message : 'Could not load event management.');
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [api, canManage, eventId]));

  const current = details?.id === eventId ? details : null;
  const ended = !!event && Date.parse(event.endsAt) <= now.getTime();
  const editable = canManage && event?.status === 'active' && !ended;
  const row = current && directionsRow(current.directions.state);
  const route = current?.directions.route;

  async function cancel() {
    if (!api) return;
    setBusy(true);
    try {
      setEvent(await api.cancelEvent(eventId));
      await refresh();
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not cancel this event.');
    } finally { setBusy(false); }
  }

  function confirmCancel() {
    const message = 'This cannot be undone.';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ title: 'Cancel this event?', message,
        options: ['Cancel event', 'Keep event'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
      (index) => { if (index === 0) void cancel(); });
    } else {
      Alert.alert('Cancel this event?', message, [
        { text: 'Keep event', style: 'cancel' }, { text: 'Cancel event', style: 'destructive', onPress: () => void cancel() },
      ]);
    }
  }

  function openDirections() {
    if (row?.action === 'view' && route) router.push({ pathname: '/route/[routeId]', params: { routeId: route.id } });
    if (row?.action === 'review' && route) router.push({ pathname: '/organization/event/[eventId]/directions/[routeId]', params: { eventId, routeId: route.id } });
    if (row?.action === 'upload' && editable) router.push({ pathname: '/organization/event/[eventId]/directions/new', params: { eventId } });
  }

  return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content}>
      <Stack.Screen options={{ title: 'Manage event' }} />
      <Notice message={error ?? problem} />
      {offline ? <Notice kind="info" message="Connect to manage this event." /> : null}
      {event ? <>
        <EventDetails event={event} compact showActions={false} onTakeMeThere={() => {}} />
        <Section label="Directions">
          {current && row ? <Group>
            <PressScale accessibilityRole="button" disabled={!row.action || row.action === 'upload' && !editable}
              accessibilityState={{ disabled: !row.action || row.action === 'upload' && !editable }}
              onPress={openDirections} style={({ pressed }) => [styles.directions, pressed && styles.pressed]}>
              <View style={styles.directionsBody}>
                <Text style={text.headline}>{row.label}</Text>
                <Text style={text.footnote}>Shared with every event in {roomLabel(event.location.room)}</Text>
              </View>
              {row.action && (row.action !== 'upload' || editable) ? <Ionicon name="chevron-forward" size={18} /> : null}
            </PressScale>
          </Group> : <Text style={text.subhead}>Loading directions…</Text>}
          {current?.directions.state === 'processing' && route ? <ProgressBar label={route.progress?.stage ?? 'Processing'} percent={route.progress?.pct ?? 0} /> : null}
          {current?.directions.state === 'failed' ? <Notice message={route?.error ?? 'Directions could not be drafted. Choose another video and try again.'} /> : null}
        </Section>
        <View style={styles.actions}>
          <View style={styles.action}><Button label="Edit" kind="secondary" disabled={!editable || busy}
            onPress={() => router.push({ pathname: '/organization/event/[eventId]/edit', params: { eventId } })} /></View>
          <View style={styles.action}><Button label="Cancel event" kind="destructive" disabled={!editable} busy={busy} onPress={confirmCancel} /></View>
        </View>
        <Group><Row label="Registrations" value={String(current?.registrations.registeredCount ?? event.registeredCount)} last
          onPress={current?.registrations.people.length ? () => setShowRegistrations(true) : undefined} /></Group>
        <Modal visible={showRegistrations} presentationStyle="pageSheet" onRequestClose={() => setShowRegistrations(false)}>
          <SafeAreaView style={screenStyles.screen}>
            <View style={styles.sheetHeader}>
              <Text style={text.title}>Registrations</Text>
              <Button label="Done" kind="secondary" onPress={() => setShowRegistrations(false)} />
            </View>
            <ScrollView contentContainerStyle={screenStyles.content}>
              <Group>{current?.registrations.people.map((person, index, people) => <Row key={person.userId} label={person.name}
                value={et.dateTime(person.registeredAt)} last={index === people.length - 1} />)}</Group>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </> : <Text style={text.subhead}>Loading event…</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.m },
  action: { flex: 1 },
  directions: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingRight: space.l, paddingVertical: space.l },
  directionsBody: { flex: 1, gap: space.xs },
  pressed: { opacity: 0.65 },
  sheetHeader: { padding: space.gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.l },
});
