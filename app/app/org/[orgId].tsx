import { ScreenScrollView as ScrollView } from '../../src/ui/ScreenScrollView';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Event } from '../../../shared/types';
import { useAccount } from '../../src/account/AccountProvider';
import { useAuth } from '../../src/auth/AuthProvider';
import { useAppData } from '../../src/data/AppDataContext';
import { space, text } from '../../src/navigation/theme';
import { useOfflineHeaderRight } from '../../src/navigation/AppHeader';
import { OrganizationEventCard } from '../../src/orgs/OrganizationEventCard';
import { OrgHeader } from '../../src/orgs/OrgHeader';
import { SELECTED_ORGANIZATION_KEY } from '../../src/orgs/OrganizationTab';
import { useOrganizations } from '../../src/orgs/OrganizationsProvider';
import { Button, Notice, Section, Segmented, screenStyles } from '../../src/ui/controls';
import { HeaderIconButton } from '../../src/ui/Ionicon';
import { haptic } from '../../src/ui/haptics';

export default function PublicOrganization() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const router = useRouter();
  const { api, storage } = useAccount();
  const { state, controller } = useAuth();
  const { offline, weekEvents, now } = useAppData();
  const { organization, upsert } = useOrganizations();
  const org = organization(orgId);
  const [events, setEvents] = useState<{ id: string; list: Event[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const offlineHeaderRight = useOfflineHeaderRight();
  const owner = state.status === 'signedIn' && state.user.ownedOrganizationIds.includes(orgId);
  const key = `${orgId}:${owner ? when : 'upcoming'}`;
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!api || offline) return;
    setError(null);
    void Promise.all([api.getOrganization(orgId), api.organizationEvents(orgId, owner ? when : 'upcoming')]).then(([fresh, list]) => {
      if (!active) return;
      upsert(fresh);
      setEvents({ id: key, list });
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load this organization.'); });
    return () => { active = false; };
  }, [api, key, offline, orgId, owner, upsert, when]));
  const following = state.status === 'signedIn' && state.user.followingOrganizationIds.includes(orgId);
  const canFollow = state.status === 'signedIn' && state.verified && !offline && !!org;
  const canManage = owner && canFollow;
  const list = (events?.id === key ? events.list : owner && when === 'past' ? [] : weekEvents.filter((event) => event.organizationId === orgId))
    .filter((event) => owner || event.status === 'active' && Date.parse(event.endsAt) > now.getTime());

  async function openOwnerScreen(pathname: '/organization/edit' | '/organization/create-event' | '/organization/event/[eventId]', eventId?: string) {
    await storage.setItem(SELECTED_ORGANIZATION_KEY, orgId).catch(() => {});
    router.push({ pathname, params: { organizationId: orgId, ...(eventId && { eventId }) } });
  }

  async function follow() {
    if (!api || !org) return;
    setBusy(true);
    try {
      const result = await api.setFollowing(orgId, !following);
      upsert({ ...org, followerCount: result.followerCount });
      await controller.setUser(await api.me());
      haptic('success');
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update your follow.'); }
    finally { setBusy(false); }
  }
  return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content}>
      <Stack.Screen options={{ title: 'Organization',
        headerRight: canManage ? () => <HeaderIconButton name="pencil" label="Edit organization"
          onPress={() => void openOwnerScreen('/organization/edit')} /> : offlineHeaderRight,
      }} />
      {org ? <OrgHeader key={orgId} organization={org} action={owner
        ? <Button label="Create event" kind="gold" disabled={!canManage}
            onPress={() => void openOwnerScreen('/organization/create-event')} />
        : <Button feedback={false} label={following ? 'Following ✓' : 'Follow'} kind={following ? 'outline' : 'gold'} busy={busy}
            disabled={!canFollow} onPress={() => void follow()} />
      } /> : <Text style={text.subhead}>Loading organization…</Text>}
      <Notice message={error} />
      <Section label={owner ? 'Events' : 'Upcoming events'}>
        {owner ? <Segmented<'upcoming' | 'past'> value={when} onChange={setWhen} options={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'past', label: 'Past' }]} /> : null}
        {list.length ? <View style={styles.cards}>{list.map((event) => <OrganizationEventCard key={event.id} event={event}
          onPress={() => owner ? void openOwnerScreen('/organization/event/[eventId]', event.id)
            : router.push({ pathname: '/event/[eventId]', params: { eventId: event.id } })} />)}</View>
          : <Text style={text.subhead}>{owner && when === 'past' ? 'No past events.' : 'No upcoming events.'}</Text>}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ cards: { gap: space.s } });
