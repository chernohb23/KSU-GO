import { Linking, StyleSheet, Text, View } from 'react-native';

import type { Organization } from '../../../shared/types.ts';
import { space, text } from '../navigation/theme';
import { Badge, Group, Row } from '../ui/controls';
import { displayUrl } from './organizations.ts';

/** The organization's club card: badge, name, description, then its facts as a grouped list. */
export function OrgHeader({ organization }: { organization: Organization }) {
  const { logo, name, description, memberCount, followerCount, meets, contactEmail, website } = organization;
  return (
    <View style={styles.root}>
      <View style={styles.identity}>
        <Badge label={logo.initials} color={logo.color} size={72} />
        <View style={styles.titles}>
          <Text accessibilityRole="header" style={text.title}>{name}</Text>
          <Text style={[text.subhead, text.figures]}>
            {memberCount} {memberCount === 1 ? 'member' : 'members'}, {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
          </Text>
        </View>
      </View>
      <Text style={styles.description}>{description}</Text>
      {meets || contactEmail || website ? (
        <Group>
          {meets ? <Row label="Meets" value={meets} last={!contactEmail && !website} /> : null}
          {contactEmail ? (
            <Row label="Email" value={contactEmail} last={!website}
              onPress={() => { void Linking.openURL(`mailto:${contactEmail}`); }} />
          ) : null}
          {website ? <Row label="Website" value={displayUrl(website)} last onPress={() => { void Linking.openURL(website); }} /> : null}
        </Group>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.l },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.l },
  titles: { flex: 1, gap: space.xs },
  description: { ...text.body, color: '#2b3b42' },
});

