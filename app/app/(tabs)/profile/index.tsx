import { ScreenScrollView as ScrollView } from '../../../src/ui/ScreenScrollView';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '../../../src/account/AccountProvider';
import { countdown, insights, interests, upcomingRegistrations } from '../../../src/account/insights';
import { Interests } from '../../../src/account/Interests';
import { useAuth } from '../../../src/auth/AuthProvider';
import { useAppData } from '../../../src/data/AppDataContext';
import { EventListRow } from '../../../src/events/EventListRow';
import { SavedEventRow, savedListStyles } from '../../../src/events/SavedEventRow';
import { space, text } from '../../../src/navigation/theme';
import { useOrganizations } from '../../../src/orgs/OrganizationsProvider';
import { Badge, Button, Group, initials, Notice, Row, Section, screenStyles } from '../../../src/ui/controls';
import { useWeekChoices } from '../../../src/week/useWeekChoices';

export default function ProfileScreen() {
  const router = useRouter();
  const { state, controller } = useAuth();
  const { accountId, registrations, refreshRegistrations, weekChoices } = useAccount();
  const { weekEvents, now, offline } = useAppData();
  const { organizations, refresh } = useOrganizations();
  const { choices, loadFailed, retry } = useWeekChoices();
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    void refreshRegistrations();
    void refresh();
    if (!offline) void controller.recheck();
  }, [controller, offline, refresh, refreshRegistrations]));

  if (state.status !== 'signedIn') return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content}>
      <View style={styles.identity}>
        <Badge label="?" color="ink" size={88} />
        <Text style={text.title}>Browsing offline</Text>
        <Text style={[text.subhead, styles.center]}>Sign in to see your events.</Text>
      </View>
      <Button label="Sign in" onPress={() => controller.leaveGuest()} />
    </ScrollView>
  );
  const { user } = state;
  const saved = choices?.filter((choice) => choice.saved !== null) ?? [];
  const upcoming = upcomingRegistrations(registrations ?? [], now);
  const counts = insights({ registrations: registrations ?? [], savedCount: saved.length,
    followingCount: user.followingOrganizationIds.length, now });
  const suggested = interests([...saved.map((choice) => choice.category), ...(registrations ?? []).map((r) => r.event.category)]);
  const canEdit = state.verified && !offline;

  function confirmSignOut() {
    const signOut = () => void controller.signOut();
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: ['Sign out', 'Cancel'],
      title: 'Sign out?', destructiveButtonIndex: 0, cancelButtonIndex: 1 }, (index) => { if (index === 0) signOut(); });
    else Alert.alert('Sign out?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOut }]);
  }
  const openEvent = (eventId: string) => router.push({ pathname: '/event/[eventId]', params: { eventId } });
  const figures = [
    { label: 'This month', value: registrations === null ? '—' : String(counts.registeredThisMonth) },
    { label: 'Upcoming', value: registrations === null ? '—' : String(counts.upcoming) },
    { label: 'Saved', value: choices === null ? '—' : String(counts.saved) },
    { label: 'Following', value: String(counts.following) },
  ];
  return (
    <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content}>
      <View style={styles.identity}>
        <Badge label={initials(user.name)} color={user.profile.avatarColor} size={88} />
        <Text accessibilityRole="header" style={text.largeTitle}>{user.name}</Text>
        {user.profile.major || user.profile.classYear ? <Text style={[text.subhead, styles.center]}>
          {[user.profile.major, user.profile.classYear ? `Class of ${user.profile.classYear}` : null].filter(Boolean).join(', ')}
        </Text> : <Text style={text.subhead}>{user.email}</Text>}
        {user.profile.bio ? <Text style={[text.body, styles.center]}>{user.profile.bio}</Text> : null}
      </View>
      <Button label="Edit profile" kind="secondary" disabled={!canEdit} onPress={() => router.push('/edit-profile')} />
      <Section>
        <View style={styles.insights}>{figures.map((figure) => <View key={figure.label} style={styles.figure}>
          <Text style={[text.title, text.figures]}>{figure.value}</Text><Text style={[text.footnote, styles.statLabel]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{figure.label}</Text>
        </View>)}</View>
      </Section>
      <Section label="Upcoming">
        {registrations === null ? <Text style={text.subhead}>Connect to load your events.</Text>
          : upcoming.length ? upcoming.map((event) => <View key={event.id} style={styles.upcoming}>
            <Group><EventListRow event={event} now={now} last onPress={() => openEvent(event.id)} /></Group>
            <Text style={[text.footnote, text.figures]}>{countdown(event, now)}</Text>
            {event.status === 'active' && event.routeId ? <Button label="Take me there" kind="ink"
              onPress={() => router.push({ pathname: '/route/[routeId]', params: { routeId: event.routeId as string, eventId: event.id } })} /> : null}
          </View>) : <Text style={text.subhead}>No upcoming events.</Text>}
      </Section>
      <Section label="Saved">
        {loadFailed ? <Button label="Retry saved events" kind="secondary" onPress={retry} /> : choices === null ? <Text style={text.subhead}>Loading saved events…</Text>
          : saved.length ? <View style={savedListStyles.group}>{saved.map((choice, index) => {
            const event = weekEvents.find((event) => event.id === choice.id);
            return <SavedEventRow key={choice.id} title={event?.title ?? choice.saved!.title}
              startsAt={event?.startsAt ?? choice.saved!.startsAt} now={now} last={index === saved.length - 1}
              onPress={() => openEvent(choice.id)} onRemove={async () => {
                setError(null);
                try { await weekChoices.remove(choice.id); }
                catch { setError('Could not remove this event. Try again.'); }
              }} />;
          })}</View> : <Text style={text.subhead}>No saved events.</Text>}
      </Section>
      <Interests key={accountId} suggested={suggested} />
      <Section label="Organizations I follow">
        {user.followingOrganizationIds.length ? <Group>{user.followingOrganizationIds.map((id, index, ids) => {
          const org = organizations.find((org) => org.id === id);
          return <Row key={id} label={org?.name ?? 'Organization'} last={index === ids.length - 1}
            onPress={() => router.push({ pathname: '/org/[orgId]', params: { orgId: id } })} />;
        })}</Group> : <Text style={text.subhead}>No organizations followed.</Text>}
      </Section>
      <Button label="Create organization" disabled={!canEdit} onPress={() => router.push('/new-organization')} />
      <Notice message={error} />
      <Button label="Sign out" kind="destructive" onPress={confirmSignOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: space.s },
  center: { textAlign: 'center' },
  insights: { flexDirection: 'row', gap: space.s },
  figure: { flex: 1, alignItems: 'center', gap: space.xs },
  statLabel: { alignSelf: 'stretch', textAlign: 'center' },
  upcoming: { gap: space.s, marginBottom: space.s },
});
