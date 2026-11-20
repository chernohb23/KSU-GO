import { ScreenScrollView as ScrollView } from '../ui/ScreenScrollView';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { useAccount } from '../account/AccountProvider';
import { useAppData } from '../data/AppDataContext';
import { text, tone } from '../navigation/theme';
import { useOrganizer } from '../organizer/context';
import { DraftReview } from '../organizer/DraftReview';
import { ROUTE_POLL_MS } from '../organizer/session';
import { ProgressBar } from '../organizer/ui';
import { Button, Notice, screenStyles } from '../ui/controls';
import { useManagedEvent } from './useManagedEvent';
import { useDockClearance } from '../navigation/DockSpace';
import { haptic } from '../ui/haptics';

export default function ReviewDirections() {
  const { eventId, routeId } = useLocalSearchParams<{ eventId: string; routeId: string }>();
  const router = useRouter();
  const { api, canManage } = useManagedEvent(eventId);
  const { session, routes, readErrors } = useOrganizer();
  const { refresh } = useAppData();
  const { refreshRegistrations } = useAccount();
  const [authorized, setAuthorized] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clearance = useDockClearance();
  const priorStatus = useRef<string | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!api || !canManage) return;
    void api.eventDirections(eventId).then(async (directions) => {
      if (!active) return;
      if (directions.route?.id !== routeId) {
        setError('Directions changed. Open them from the event.');
        return;
      }
      setAuthorized(routeId);
      setError(null);
      await session.read(routeId);
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not open directions.'); });
    return () => { active = false; };
  }, [api, canManage, eventId, routeId, session]));
  const route = authorized === routeId ? routes[routeId] : null;
  useEffect(() => {
    if (priorStatus.current === 'draft' && route?.status === 'confirmed') haptic('success');
    priorStatus.current = route?.status;
    if (!canManage || route?.status !== 'processing') return;
    const timer = setInterval(() => void session.read(routeId), ROUTE_POLL_MS);
    return () => clearInterval(timer);
  }, [canManage, route?.status, routeId, session]);
  useEffect(() => {
    if (route?.status === 'confirmed') { void refresh(); void refreshRegistrations(); }
  }, [refresh, refreshRegistrations, route?.status]);
  const back = () => router.dismissTo({ pathname: '/organization/event/[eventId]', params: { eventId } });
  if (route?.status === 'draft' && canManage && !error) return <>
    <Stack.Screen options={{ title: 'Review draft' }} />
    <View style={{ flex: 1, paddingBottom: clearance, backgroundColor: tone.paper }}>
      <DraftReview route={route} back={back} />
    </View>
  </>;
  return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content}>
      <Stack.Screen options={{ title: 'Directions' }} />
      <Notice message={error ?? readErrors[routeId] ?? null} />
      {!canManage ? <Notice kind="info" message="Connect to review directions." /> : null}
      {route?.status === 'processing' ? <ProgressBar label={route.progress?.stage ?? 'Processing'} percent={route.progress?.pct ?? 0} /> : null}
      {route?.status === 'confirmed' ? <>
        <Text style={text.title}>Directions ready</Text>
        <Button label="View directions" onPress={() => router.push({ pathname: '/route/[routeId]', params: { routeId } })} />
      </> : route?.status === 'failed' ? <Notice message={route.error ?? 'Directions could not be drafted. Return to the event and try again.'} />
        : !route ? <Text style={text.subhead}>Loading directions…</Text> : null}
      <Button label="Back to event" kind="secondary" onPress={back} />
    </ScrollView>
  );
}
