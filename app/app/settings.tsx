import { radius, space } from '../src/navigation/theme';
import { ScreenScrollView as ScrollView } from '../src/ui/ScreenScrollView';
import { PressScale } from '../src/ui/PressScale';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';

import { useAuth } from '../src/auth/AuthProvider';
import { useAppData } from '../src/data/AppDataContext';
import { showsSignIn } from '../src/navigation/access';
import { useDemoSession } from '../src/settings/DemoSession';
import { palette } from '../src/navigation/Brand';

export default function SettingsScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const { serverUrl, setServerUrl, offline, weekEvents } = useAppData();
  // Opens the details of an event that has directions, through the normal event screen.
  const eventWithRoute = showsSignIn(state) ? null : weekEvents.find((event) => event.routeId) ?? null;
  const [url, setUrl] = useState(serverUrl ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const { resetDemo } = useDemoSession();
  const [resetting, setResetting] = useState(false);
  const saving = status === 'saving';

  useEffect(() => setUrl(serverUrl ?? ''), [serverUrl]);

  async function save() {
    setStatus('saving');
    try {
      await setServerUrl(url);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Server settings</Text>
      <Text style={styles.body}>Leave blank to use the default address.</Text>
      <TextInput
        accessibilityLabel="Server URL"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!saving && !resetting}
        onChangeText={(value) => { setUrl(value); setStatus('idle'); }}
        value={url}
        style={styles.input}
      />
      <PressScale accessibilityRole="button" disabled={saving || resetting} onPress={() => void save()} style={styles.button}>
        <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save server address'}</Text>
      </PressScale>
      <Text accessibilityLiveRegion="polite" style={styles.message}>
        {saving && 'Checking server…'}
        {status === 'error' && 'Could not save the server address.'}
        {status === 'saved' && !serverUrl && 'Address cleared.'}
        {status === 'saved' && serverUrl && (offline
          ? 'Could not connect. Check the address.'
          : 'Connected.')}
      </Text>
      {eventWithRoute ? (
        <PressScale accessibilityRole="button" style={styles.reset} disabled={saving || resetting}
          onPress={() => router.push({ pathname: '/event/[eventId]', params: { eventId: eventWithRoute.id } })}>
          <Text style={styles.buttonText}>Preview directions</Text>
        </PressScale>
      ) : null}
      <PressScale accessibilityRole="button" style={styles.reset} disabled={saving || resetting}
        onPress={() => Alert.alert('Reset app?', 'Clear all saved events, interests and preferences, and sign out?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset', style: 'destructive', onPress: () => {
            setResetting(true);
            void resetDemo().then(
              () => Alert.alert('Reset complete'),
              () => { setResetting(false); Alert.alert('Could not reset the app', 'Please try again.'); },
            );
          } },
        ])}>
        <Text style={styles.buttonText}>{resetting ? 'Resetting…' : 'Reset app'}</Text>
      </PressScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.paper },
  container: { padding: space.gutter },
  title: { color: palette.ink, fontSize: 22, fontWeight: '700' },
  body: { color: palette.muted, marginTop: 8, fontSize: 15, lineHeight: 21 },
  input: { marginTop: 20, borderWidth: 1, borderColor: '#c5ced5', borderRadius: radius.control, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 11, color: palette.ink },
  button: { minHeight: 50, marginTop: space.l, paddingVertical: 12, borderRadius: radius.control, backgroundColor: palette.gold, alignItems: 'center' },
  buttonText: { color: palette.ink, fontWeight: '700' },
  reset: { minHeight: 50, marginTop: space.l, alignItems: 'center', padding: 12, borderRadius: radius.control, borderColor: '#8999a4', borderWidth: 1 },
  message: { color: palette.muted, marginTop: 12, minHeight: 20 },
});
