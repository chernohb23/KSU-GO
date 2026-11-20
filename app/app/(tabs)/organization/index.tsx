import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Event } from '../../../../shared/types';
import { useAccount } from '../../../src/account/AccountProvider';
import { useAuth } from '../../../src/auth/AuthProvider';
import { useAppData } from '../../../src/data/AppDataContext';
import { EventListRow } from '../../../src/events/EventListRow';
import { AppTitle } from '../../../src/navigation/AppHeader';
import { space, text, tone } from '../../../src/navigation/theme';
import { OrgHeader } from '../../../src/orgs/OrgHeader';
import { useOrganizationTab } from '../../../src/orgs/OrganizationTab';
import { useOrganizations } from '../../../src/orgs/OrganizationsProvider';
import { ownedOrganizations } from '../../../src/orgs/organizations';
import { Button, Group, Notice, Section, Segmented, screenStyles } from '../../../src/ui/controls';

type When = 'upcoming' | 'past';

export default function OrganizationHome() {
  const router = useRouter();
  const { state } = useAuth();
  const { api } = useAccount();
  const { offline, now } = useAppData();
  const { organizations, organization, refresh } = useOrganizations();
  const { organizationId, select } = useOrganizationTab();
  const org = organization(organizationId);
  const owned = ownedOrganizations(organizations, state.status === 'signedIn' ? state.user.ownedOrganizationIds : []);
  const [when, setWhen] = useState<When>('upcoming');
  const [events, setEvents] = useState<{ key: string; list: Event[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${organizationId}:${when}`;

  useFocusEffect(useCallback(() => {
    let active = true;
    void refresh();
    if (!api || !organizationId || offline) return () => { active = false; };
    setError(null);
    api.organizationEvents(organizationId, when).then(
      (list) => { if (active) setEvents({ key, list }); },
      () => { if (active) setError('Could not load events. Pull the server back up and try again.'); },
    );
    return () => { active = false; };
  }, [api, key, offline, organizationId, refresh, when]));

  function switchOrganization() {
    const names = owned.map((o) => o.name);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...names, 'Cancel'], cancelButtonIndex: names.length,
        title: 'Your organizations' }, (index) => { if (index < names.length) select(owned[index].id); });
    } else {
      Alert.alert('Your organizations', undefined, [...owned.map((o) => ({ text: o.name, onPress: () => select(o.id) })), { text: 'Cancel', style: 'cancel' as const }]);
    }
  }

  const list = events?.key === key ? events.list : null;
  return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content}>
      <Stack.Screen options={{ headerTitle: () => <AppTitle /> }} />
      {owned.length > 1 && org ? (
        <Pressable accessibilityRole="button" accessibilityHint="Switch organization" onPress={switchOrganization} style={styles.switcher}>
          <Text style={styles.switcherText}>{org.name}</Text>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>
      ) : null}
      {org ? <OrgHeader organization={org} /> : <Text style={text.subhead}>Loading your organization…</Text>}

      <View style={styles.actions}>
        <View style={styles.action}><Button label="Edit organization" kind="secondary" disabled={!org || offline || state.status !== 'signedIn' || !state.verified}
          onPress={() => router.push('/organization/edit')} /></View>
        <View style={styles.action}><Button label="Create event" disabled={!org || offline || state.status !== 'signedIn' || !state.verified}
          onPress={() => router.push('/organization/create-event')} /></View>
      </View>
      {offline ? <Notice kind="info" message="Managing an organization needs the server. Showing bundled data." /> : null}

      <Section label="Events">
        <Segmented<When> value={when} onChange={setWhen}
          options={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'past', label: 'Past' }]} />
        <Notice message={error} />
        {list === null ? (
          <Text style={[text.footnote, styles.pad]}>{offline ? 'Events load when the server answers.' : 'Loading…'}</Text>
        ) : list.length ? (
          <Group>
            {list.map((event, index) => (
              <EventListRow key={event.id} event={event} now={now} last={index === list.length - 1}
                trailing={event.capacity !== null ? `${event.registeredCount}/${event.capacity}` : `${event.registeredCount}`}
                onPress={() => router.push({ pathname: '/organization/event/[eventId]', params: { eventId: event.id } })} />
            ))}
          </Group>
        ) : (
          <View style={styles.empty}>
            <Text style={text.headline}>{when === 'upcoming' ? 'No upcoming events' : 'No past events yet'}</Text>
            <Text style={[text.subhead, styles.center]}>
              {when === 'upcoming' ? 'Create one for the next seven days. It shows on the map once it starts within 24 hours.' : 'Events you ran show up here after they end.'}
            </Text>
          </View>
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start' },
  switcherText: { ...text.headline, color: tone.amber },
  chevron: { color: tone.amber, fontSize: 18, marginTop: -6 },
  actions: { flexDirection: 'row', gap: space.m },
  action: { flex: 1 },
  pad: { paddingHorizontal: space.l },
  empty: { alignItems: 'center', gap: space.s, paddingVertical: space.xl },
  center: { textAlign: 'center' },
});
