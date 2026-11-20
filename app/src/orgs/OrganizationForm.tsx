import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Organization, OrganizationRequest } from '../../../shared/types.ts';
import { space, text } from '../navigation/theme';
import { Badge, Button, Chip, ChipRow, Field, Group, Notice, Section } from '../ui/controls';

/** Suggested initials from a name: "Game Development Club" → "GDC" (capped at 4 letters). */
export function suggestInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  const letters = words.length > 1 ? words.map((word) => word.replace(/[^A-Za-z]/g, '')[0] ?? '').join('') : (words[0] ?? '').slice(0, 2);
  return letters.toUpperCase().slice(0, 4);
}

/** Create or edit an organization. The server checks every rule and its message shows here. */
export function OrganizationForm({ initial, submitLabel, onSubmit }: {
  initial: Organization | null; submitLabel: string; onSubmit(body: OrganizationRequest): Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [initialsText, setInitials] = useState(initial?.logo.initials ?? '');
  const [color, setColor] = useState<'gold' | 'ink'>(initial?.logo.color ?? 'gold');
  const [members, setMembers] = useState(initial ? String(initial.memberCount) : '');
  const [meets, setMeets] = useState(initial?.meets ?? '');
  const [email, setEmail] = useState(initial?.contactEmail ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badge = (initialsText.trim() || suggestInitials(name) || '?').toUpperCase();

  async function submit() {
    setError(null);
    if (!/^\d*$/.test(members.trim())) return setError('Members is a whole number.');
    setBusy(true);
    try {
      await onSubmit({
        name, description,
        logo: { initials: badge, color },
        memberCount: members.trim() ? Number(members.trim()) : 0,
        meets: meets.trim() ? meets : null, contactEmail: email.trim() ? email : null, website: website.trim() ? website : null,
      });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save the organization. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.preview}>
        <Badge label={badge} color={color} size={72} />
        <Text style={[text.footnote, styles.center]}>Original initials badge. No real logos.</Text>
      </View>
      <Section label="Organization">
        <Group>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Chess Society" editable={!busy} />
          <Field label="Description" value={description} onChangeText={setDescription} multiline maxLength={280}
            placeholder="What you do, in a sentence or two." editable={!busy} last />
        </Group>
      </Section>
      <Section label="Badge">
        <Group>
          <Field label="Initials (1 to 4 letters)" value={initialsText} autoCapitalize="characters" maxLength={4}
            onChangeText={(value) => setInitials(value.replace(/[^A-Za-z]/g, '').toUpperCase())} placeholder={suggestInitials(name) || 'CS'}
            editable={!busy} last />
        </Group>
        <ChipRow>
          <Chip label="Gold" selected={color === 'gold'} onPress={() => setColor('gold')} />
          <Chip label="Ink" selected={color === 'ink'} onPress={() => setColor('ink')} />
        </ChipRow>
      </Section>
      <Section label="Details" footer="Members is the number you enter. Followers are counted from real follows.">
        <Group>
          <Field label="Members" value={members} onChangeText={setMembers} keyboardType="number-pad" placeholder="0" editable={!busy} />
          <Field label="Meets" value={meets} onChangeText={setMeets} placeholder="Tuesdays 6 PM, Mathematics 215" maxLength={80} editable={!busy} />
          <Field label="Contact email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
            placeholder="club@example.com" editable={!busy} />
          <Field label="Website" value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url"
            placeholder="https://" editable={!busy} last />
        </Group>
      </Section>
      <Notice message={error} />
      <Button label={submitLabel} busy={busy} disabled={!name.trim() || !description.trim()} onPress={() => void submit()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xl },
  preview: { alignItems: 'center', gap: space.s },
  center: { textAlign: 'center' },
});
