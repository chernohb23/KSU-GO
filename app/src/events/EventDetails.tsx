import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { roomLabel } from '../../../shared/rooms';
import type { Event } from '../../../shared/types.ts';
import { useAccount } from '../account/AccountProvider';
import { useAuth } from '../auth/AuthProvider';
import { useAppData } from '../data/AppDataContext';
import { getEventFlagState } from '../data/events';
import { registerAvailability } from '../navigation/access';
import { radius, space, text, tone } from '../navigation/theme';
import { buildingName } from '../organizer/ui';
import { useOrganizations } from '../orgs/OrganizationsProvider';
import { capacityLabel, et } from './format';

export { roomLabel } from '../../../shared/rooms';

function statusLine(event: Event, now: Date): string | null {
  const state = getEventFlagState(event, now);
  if (state === 'live') return 'Happening now';
  const minutes = Math.ceil((Date.parse(event.startsAt) - now.getTime()) / 60_000);
  if (state === 'soon') return `Starts in ${Math.max(1, minutes)} min`;
  return null;
}

/** The one event card: the map's sheet and the event screen both render it. */
export function EventDetails({ event, onTakeMeThere, showActions = true }: { event: Event; onTakeMeThere(routeId: string): void; showActions?: boolean }) {
  const router = useRouter();
  const { organization } = useOrganizations();
  const { state, controller } = useAuth();
  const { offline, now } = useAppData();
  const { registeredEventIds, registrationsReady, register } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const availability = registerAvailability({ state, offline, registered: registeredEventIds.includes(event.id) });
  const partner = organization(event.partnerOrganizationId)?.name;
  const cancelled = event.status === 'cancelled';
  const status = cancelled ? null : statusLine(event, now);
  const full = event.capacity !== null && event.registeredCount >= event.capacity;

  async function onRegister() {
    setError(null);
    if (availability === 'sign-in') {
      Alert.alert('Sign in to register', 'Registering needs an account. You can keep browsing without one.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => controller.leaveGuest() },
      ]);
      return;
    }
    setBusy(true);
    try {
      await register(event.id);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Registration failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const registered = availability === 'registered';
  const disabled = busy || registered || availability === 'needs-server' || (availability === 'available' && !registrationsReady);

  return (
    <View style={styles.root}>
      {cancelled ? <Text accessibilityRole="alert" style={styles.cancelled}>Cancelled</Text> : null}
      <View style={styles.heading}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <Text accessibilityRole="header" style={text.title}>{event.title}</Text>
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/org/[orgId]', params: { orgId: event.organizationId } })}>
          <Text style={styles.organizer}>{partner ? `${event.organizer} with ${partner}` : event.organizer} ›</Text>
        </Pressable>
      </View>

      <View style={styles.facts}>
        <Fact label="When" value={et.range(event.startsAt, event.endsAt, now)} figures />
        <Fact label="Where" value={`${buildingName(event.location.buildingId)}, ${roomLabel(event.location.room)}`} />
        <Fact label="Going" value={capacityLabel(event)} figures emphasis={full} last />
      </View>

      {event.description ? <Text style={styles.description}>{event.description}</Text> : null}

      {showActions && !cancelled ? <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled, busy }}
          disabled={disabled}
          onPress={() => void onRegister()}
          style={({ pressed }) => [styles.primary, registered && styles.done, disabled && !registered && styles.dimmed, pressed && styles.pressed]}
        >
          {busy ? <ActivityIndicator color={tone.surface} /> : (
            <Text style={[styles.primaryText, registered && styles.doneText]}>
              {registered ? 'Registered' : 'Register'}
            </Text>
          )}
        </Pressable>
        {availability === 'needs-server' && !registered ? (
          <Text style={styles.note}>Registering needs the server. Try again once the Offline data badge is gone.</Text>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {event.routeId ? (
          <Pressable accessibilityRole="button" onPress={() => onTakeMeThere(event.routeId as string)}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Take me there</Text>
          </Pressable>
        ) : (
          <Text style={styles.note}>Directions to this room aren’t ready yet.</Text>
        )}
      </View> : null}
    </View>
  );
}

function Fact({ label, value, figures = false, emphasis = false, last = false }: {
  label: string; value: string; figures?: boolean; emphasis?: boolean; last?: boolean;
}) {
  return (
    <View style={[styles.fact, last && styles.lastFact]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[text.body, styles.factValue, figures && text.figures, emphasis && styles.emphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.l },
  heading: { gap: space.xs },
  status: { ...text.footnote, color: tone.amber, fontWeight: '600' },
  organizer: { ...text.subhead, color: tone.amber, paddingVertical: space.xs },
  cancelled: { ...text.headline, color: tone.danger, padding: space.l, borderRadius: radius.group, backgroundColor: tone.surface },
  facts: { borderRadius: radius.group, backgroundColor: tone.surface, paddingHorizontal: space.l },
  fact: { flexDirection: 'row', alignItems: 'baseline', gap: space.m, paddingVertical: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  lastFact: { borderBottomWidth: 0 },
  factLabel: { ...text.subhead, width: 56 },
  factValue: { flex: 1 },
  emphasis: { color: tone.amber, fontWeight: '600' },
  description: { ...text.body, color: '#2b3b42' },
  actions: { gap: space.s },
  primary: { minHeight: 50, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: tone.amber },
  primaryText: { ...text.headline, color: tone.surface },
  done: { backgroundColor: tone.goldSoft },
  doneText: { color: tone.amber },
  dimmed: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  secondary: { minHeight: 50, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tone.ink },
  secondaryText: { ...text.headline, color: tone.paper },
  note: { ...text.footnote, textAlign: 'center' },
  error: { ...text.footnote, color: tone.error, textAlign: 'center' },
});
