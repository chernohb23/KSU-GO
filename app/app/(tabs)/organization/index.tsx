import { ScreenScrollView as ScrollView } from '../../../src/ui/ScreenScrollView';
import { PressScale } from '../../../src/ui/PressScale';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, StyleSheet, Text, View } from 'react-native';

import type { Event } from '../../../../shared/types';
import { useAccount } from '../../../src/account/AccountProvider';
import { useAuth } from '../../../src/auth/AuthProvider';
import { useAppData } from '../../../src/data/AppDataContext';
import { OrganizationEventCard } from '../../../src/orgs/OrganizationEventCard';
import { useOfflineHeaderRight } from '../../../src/navigation/AppHeader';
import { HeaderIconButton, Ionicon } from '../../../src/ui/Ionicon';
import { space, text, tone } from '../../../src/navigation/theme';
import { OrgHeader } from '../../../src/orgs/OrgHeader';
import { useOrganizationTab } from '../../../src/orgs/OrganizationTab';
import { useOrganizations } from '../../../src/orgs/OrganizationsProvider';
import { ownedOrganizations } from '../../../src/orgs/organizations';
import { Button, Notice, Section, Segmented, screenStyles } from '../../../src/ui/controls';

type When = 'upcoming' | 'past';

export default function OrganizationHome() {
  const router = useRouter();
  const { state } = useAuth();
  const { api } = useAccount();
  const { offline, weekEvents } = useAppData();
  const offlineHeaderRight = useOfflineHeaderRight();
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
      () => { if (active) setError('Could not load events. Try again.'); },
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

  const list = events?.key === key ? events.list
    : offline && when === 'upcoming' ? weekEvents.filter(event => event.organizationId === organizationId)
    : offline ? [] : null;
  const canEdit = !!org && !offline && state.status === 'signedIn' && state.verified;
  return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content}>
      <Stack.Screen options={{
        title: 'Organization',
        headerTitle: owned.length > 1 ? () => <PressScale accessibilityRole="button" accessibilityLabel="Switch organization"
          onPress={switchOrganization} style={styles.switcher}>
          <Text style={text.headline}>Organization</Text><Ionicon name="chevron-down" size={18} color={tone.amber} />
        </PressScale> : undefined,
        headerRight: canEdit ? () => <HeaderIconButton name="pencil" label="Edit organization"
          onPress={() => router.push('/organization/edit')} /> : offlineHeaderRight,
      }} />
      {org ? <OrgHeader key={org.id} organization={org} action={
        <Button label="Create event" kind="gold" disabled={!canEdit} onPress={() => router.push('/organization/create-event')} />
      } /> : <Text style={text.subhead}>Loading organization…</Text>}

      <Section label="Events">
        <Segmented<When> value={when} onChange={setWhen}
          options={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'past', label: 'Past' }]} />
        <Notice message={error} />
        {list === null ? (
          <Text style={[text.footnote, styles.pad]}>Loading…</Text>
        ) : list.length ? (
          <View style={styles.cards}>
            {list.map((event) => <OrganizationEventCard key={event.id} event={event}
              onPress={() => router.push({ pathname: '/organization/event/[eventId]', params: { eventId: event.id } })} />)}
          </View>
        ) : <Text style={text.subhead}>{when === 'upcoming' ? 'No upcoming events.' : 'No past events.'}</Text>}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', alignItems: 'center', gap: space.xs, justifyContent: 'center' },
  cards: { gap: space.s },
  pad: { paddingHorizontal: space.l },
});
