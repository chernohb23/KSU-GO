import { PressScale } from '../ui/PressScale';
import { useState, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import type { Organization } from '../../../shared/types.ts';
import { space, text, tone } from '../navigation/theme';
import { Badge, Group, Notice } from '../ui/controls';
import { Ionicon, type IoniconName } from '../ui/Ionicon';
import { displayUrl } from './organizations.ts';

/** The organization's club card: badge, name, description, then its facts as a grouped list. */
export function OrgHeader({ organization, action }: { organization: Organization; action?: ReactNode }) {
  const { logo, name, description, memberCount, followerCount, meets, contactEmail, website } = organization;
  const [error, setError] = useState<string | null>(null);
  async function open(url: string) {
    setError(null);
    try { await Linking.openURL(url); }
    catch { setError('Could not open this link.'); }
  }
  return (
    <View style={styles.root}>
      <View style={styles.identity}>
        <Badge label={logo.initials} color={logo.color} size={96} />
        <Text accessibilityRole="header" style={[text.title, styles.center]}>{name}</Text>
        <Text style={[text.subhead, text.figures, styles.center]} numberOfLines={1} adjustsFontSizeToFit>
          {memberCount} {memberCount === 1 ? 'member' : 'members'} · {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
        </Text>
      </View>
      {action}
      <Text style={styles.description}>{description}</Text>
      {meets || contactEmail || website ? (
        <Group>
          {meets ? <InfoRow icon="calendar" label="Meets" value={meets} last={!contactEmail && !website} /> : null}
          {contactEmail ? (
            <InfoRow icon="mail" label="Email" value={contactEmail} last={!website} onPress={() => void open(`mailto:${contactEmail}`)} />
          ) : null}
          {website ? <InfoRow icon="globe" label="Website" value={displayUrl(website)} last onPress={() => void open(website)} /> : null}
        </Group>
      ) : null}
      <Notice message={error} />
    </View>
  );
}

function InfoRow({ icon, label, value, onPress, last }: {
  icon: IoniconName; label: string; value: string; onPress?: () => void; last: boolean;
}) {
  const content = <View style={[styles.row, !last && styles.divider]}>
    <Ionicon name={icon} />
    <Text style={[text.subhead, styles.value]}>{value}</Text>
    {onPress ? <Ionicon name="chevron-forward" size={18} /> : null}
  </View>;
  return onPress ? <PressScale accessibilityRole="link" accessibilityLabel={`${label}: ${value}`} onPress={onPress}
    style={({ pressed }) => pressed && styles.pressed}>{content}</PressScale>
    : <View accessible accessibilityLabel={`${label}: ${value}`}>{content}</View>;
}

const styles = StyleSheet.create({
  root: { gap: space.l },
  identity: { alignItems: 'center', gap: space.s },
  center: { textAlign: 'center' },
  description: { ...text.body },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: space.m, paddingRight: space.l, paddingVertical: space.m },
  value: { flex: 1, color: tone.ink },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tone.hairline },
  pressed: { opacity: 0.65 },
});

