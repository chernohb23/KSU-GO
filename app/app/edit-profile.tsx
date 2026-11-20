import { ScreenScrollView as ScrollView } from '../src/ui/ScreenScrollView';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { User } from '../../shared/types';
import { useAccount } from '../src/account/AccountProvider';
import { useAuth } from '../src/auth/AuthProvider';
import { useAppData } from '../src/data/AppDataContext';
import { space } from '../src/navigation/theme';
import { Badge, Button, Chip, ChipRow, Field, Group, initials, Notice, Section, screenStyles } from '../src/ui/controls';

function ProfileForm({ user }: { user: User }) {
  const { api } = useAccount();
  const { controller } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [major, setMajor] = useState(user.profile.major ?? '');
  const [year, setYear] = useState(user.profile.classYear === null ? '' : String(user.profile.classYear));
  const [bio, setBio] = useState(user.profile.bio ?? '');
  const [color, setColor] = useState(user.profile.avatarColor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!api) return;
    if (year.trim() && !/^\d{4}$/.test(year.trim())) return setError('Enter a four-digit graduation year, or leave it empty.');
    setBusy(true);
    try {
      await controller.setUser(await api.updateProfile({ name, major: major.trim() || null, classYear: year.trim() ? Number(year) : null,
        bio: bio.trim() || null, avatarColor: color }));
      router.back();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your profile.'); }
    finally { setBusy(false); }
  }
  return <View style={styles.form}>
    <View style={styles.avatar}><Badge label={initials(name)} color={color} size={88} /></View>
    <Section label="About you">
      <Group>
        <Field label="Name" value={name} onChangeText={setName} maxLength={80} editable={!busy} />
        <Field label="Major" value={major} onChangeText={setMajor} placeholder="Computer Science" maxLength={60} editable={!busy} />
        <Field label="Class year" value={year} onChangeText={setYear} placeholder="2028" keyboardType="number-pad" maxLength={4} editable={!busy} />
        <Field label="Short bio" value={bio} onChangeText={setBio} placeholder="A little about you." multiline maxLength={160} editable={!busy} last />
      </Group>
    </Section>
    <Section label="Avatar color"><ChipRow>{(['gold', 'ink', 'amber'] as const).map((value) => <Chip key={value}
      label={value[0].toUpperCase() + value.slice(1)} selected={color === value} disabled={busy} onPress={() => setColor(value)} />)}</ChipRow></Section>
    <Notice message={error} />
    <Button label="Save changes" busy={busy} disabled={!name.trim()} onPress={() => void save()} />
  </View>;
}

export default function EditProfile() {
  const { state } = useAuth();
  const { offline } = useAppData();
  return <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
    <Stack.Screen options={{ title: 'Edit profile' }} />
    {state.status === 'signedIn' && state.verified && !offline ? <ProfileForm key={state.user.id} user={state.user} />
      : <Notice kind="info" message="Connect to edit your profile." />}
  </ScrollView>;
}

const styles = StyleSheet.create({ form: { gap: space.xl }, avatar: { alignItems: 'center' } });
