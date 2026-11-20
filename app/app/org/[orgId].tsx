import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text } from 'react-native';

import type { Event } from '../../../shared/types';
import { useAccount } from '../../src/account/AccountProvider';
import { useAuth } from '../../src/auth/AuthProvider';
import { useAppData } from '../../src/data/AppDataContext';
import { EventListRow } from '../../src/events/EventListRow';
import { text } from '../../src/navigation/theme';
import { OrgHeader } from '../../src/orgs/OrgHeader';
import { useOrganizations } from '../../src/orgs/OrganizationsProvider';
import { Button, Group, Notice, Section, screenStyles } from '../../src/ui/controls';

export default function PublicOrganization() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const router = useRouter();
  const { api } = useAccount();
  const { state, controller } = useAuth();
  const { offline, weekEvents, now } = useAppData();
  const { organization, upsert } = useOrganizations();
  const org = organization(orgId);
  const [events, setEvents] = useState<{ id: string; list: Event[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!api || offline) return;
    setError(null);
    void Promise.all([api.getOrganization(orgId), api.organizationEvents(orgId, 'upcoming')]).then(([fresh, list]) => {
      if (!active) return;
      upsert(fresh);
      setEvents({ id: orgId, list });
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load this organization.'); });
    return () => { active = false; };
  }, [api, offline, orgId, upsert]));
  const following = state.status === 'signedIn' && state.user.followingOrganizationIds.includes(orgId);
  const canFollow = state.status === 'signedIn' && state.verified && !offline && !!org;
  const list = (events?.id === orgId && !offline ? events.list : weekEvents.filter((event) => event.organizationId === orgId))
    .filter((event) => event.status === 'active' && Date.parse(event.endsAt) > now.getTime());

  async function follow() {
    if (!api || !org) return;
    setBusy(true);
    try {
      const result = await api.setFollowing(orgId, !following);
      upsert({ ...org, followerCount: result.followerCount });
      await controller.setUser(await api.me());
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update your follow.'); }
    finally { setBusy(false); }
  }
  return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content}>
      <Stack.Screen options={{ title: 'Organization' }} />
      {org ? <OrgHeader organization={org} /> : <Text style={text.subhead}>Loading organization…</Text>}
      <Button label={following ? 'Unfollow' : 'Follow'} kind={following ? 'secondary' : 'primary'} busy={busy} disabled={!canFollow} onPress={() => void follow()} />
      {!canFollow ? <Notice kind="info" message="Following needs a signed-in account and the server." /> : null}
      <Notice message={error} />
      <Section label="Upcoming events">
        {list.length ? <Group>{list.map((event, index) => <EventListRow key={event.id} event={event} now={now} last={index === list.length - 1}
          onPress={() => router.push({ pathname: '/event/[eventId]', params: { eventId: event.id } })} />)}</Group>
          : <Text style={text.subhead}>No upcoming events.</Text>}
      </Section>
    </ScrollView>
  );
}
