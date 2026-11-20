import { useRouter } from 'expo-router';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import organizationsJson from '../../../../shared/fixtures/organizations.json';
import type { Organization } from '../../../../shared/types';
import { useAccount } from '../../../src/account/AccountProvider';
import { useAuth } from '../../../src/auth/AuthProvider';
import { useAppData } from '../../../src/data/AppDataContext';
import { et } from '../../../src/events/format';
import { radius, space, text, tone } from '../../../src/navigation/theme';

const organizations = organizationsJson as Organization[];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

function Badge({ label, color, size, avatar = false }: { label: string; color: 'gold' | 'ink'; size: number; avatar?: boolean }) {
  return (
    <View style={[styles.badge, avatar && styles.avatar, { width: size, height: size, borderRadius: size / 2 },
      color === 'gold' ? styles.badgeGold : styles.badgeInk]}>
      <Text style={[styles.badgeText, { fontSize: size * 0.36 }, color === 'gold' ? styles.onGold : styles.onInk]}>
        {label}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { state, controller } = useAuth();
  const { registeredEventIds } = useAccount();
  const { weekEvents, now } = useAppData();

  if (state.status !== 'signedIn') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <Badge label="?" color="ink" size={88} avatar />
          <Text style={text.title}>Browsing offline</Text>
          <Text style={[text.subhead, styles.center]}>
            You can see this week’s events and follow directions. Sign in to register.
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => controller.leaveGuest()}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Sign in</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const { user } = state;
  const organization = organizations.find((org) => org.id === user.organizationId) ?? null;
  // Ended or unknown events drop out; the record itself stays on the phone.
  const registered = weekEvents.filter((event) => registeredEventIds.includes(event.id));

  function confirmSignOut() {
    const signOut = () => void controller.signOut();
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Sign out', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1,
          message: 'Your saved events stay on this phone for next time.' },
        (index) => { if (index === 0) signOut(); },
      );
    } else {
      Alert.alert('Sign out?', 'Your saved events stay on this phone for next time.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOut },
      ]);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.identity}>
        <Badge label={initials(user.name)} color="gold" size={88} avatar />
        <Text style={text.title}>{user.name}</Text>
        <Text style={text.subhead}>{user.email}</Text>
      </View>

      <View style={styles.group}>
        <View style={[styles.cell, organization && styles.divider]}>
          <Text style={text.body}>Role</Text>
          <Text style={text.subhead}>{user.role === 'organizer' ? 'Organizer' : 'Student'}</Text>
        </View>
        {organization ? (
          <View style={styles.cell}>
            <View style={styles.orgName}>
              <Badge label={organization.logo.initials} color={organization.logo.color} size={30} />
              <Text style={text.body}>{organization.name}</Text>
            </View>
            <Text style={[text.subhead, text.figures]}>{organization.memberCount} members</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Registered</Text>
        {registered.length ? (
          <View style={styles.group}>
            {registered.map((event, index) => (
              <Pressable key={event.id} accessibilityRole="button"
                onPress={() => router.push({ pathname: '/event/[eventId]', params: { eventId: event.id } })}
                style={({ pressed }) => [styles.eventCell, index < registered.length - 1 && styles.divider, pressed && styles.pressed]}>
                <Text style={text.headline} numberOfLines={2}>{event.title}</Text>
                <Text style={[text.subhead, text.figures]}>{et.when(event.startsAt, now)}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={[text.subhead, styles.sectionNote]}>Events you register for on this phone show up here.</Text>
        )}
      </View>

      <Pressable accessibilityRole="button" onPress={confirmSignOut}
        style={({ pressed }) => [styles.group, styles.signOut, pressed && styles.pressed]}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tone.paper },
  content: { padding: space.gutter, paddingBottom: space.xxl, gap: space.xl },
  center: { textAlign: 'center' },
  identity: { alignItems: 'center', gap: space.xs, paddingTop: space.s },
  badge: { alignItems: 'center', justifyContent: 'center' },
  avatar: { marginBottom: space.s },
  badgeGold: { backgroundColor: tone.gold },
  badgeInk: { backgroundColor: tone.ink },
  badgeText: { fontWeight: '700', letterSpacing: 0.5 },
  onGold: { color: tone.ink },
  onInk: { color: tone.paper },
  group: { borderRadius: radius.group, backgroundColor: tone.surface, paddingLeft: space.l },
  cell: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: space.m, paddingRight: space.l, paddingVertical: space.s },
  orgName: { flexDirection: 'row', alignItems: 'center', gap: space.m, flexShrink: 1 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  section: { gap: space.s },
  sectionTitle: { ...text.footnote, paddingLeft: space.l },
  sectionNote: { paddingHorizontal: space.l },
  eventCell: { gap: 2, paddingVertical: space.m, paddingRight: space.l },
  signOut: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingLeft: 0 },
  signOutText: { ...text.body, color: tone.danger },
  primary: { minHeight: 50, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: tone.amber },
  primaryText: { ...text.headline, color: tone.surface },
  pressed: { opacity: 0.6 },
});
