import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { useAuth } from '../src/auth/AuthProvider';
import { easternClock } from '../src/events/format';
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
      <Text style={styles.body}>Enter the API server's base address. For the PC mock server, use the Wi-Fi address ending in :8000. Leave blank to use the default.</Text>
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
      <Pressable accessibilityRole="button" disabled={saving || resetting} onPress={() => void save()} style={styles.button}>
        <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save server address'}</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={styles.message}>
        {saving && 'Checking server…'}
        {status === 'error' && 'Could not save the server address.'}
        {status === 'saved' && !serverUrl && 'Address cleared. Using offline data.'}
        {status === 'saved' && serverUrl && (offline
          ? 'Address saved. Could not connect to the API. Check the address and that the server is running.'
          : 'Address saved. Connected to server.')}
      </Text>
      {eventWithRoute ? (
        <Pressable accessibilityRole="button" style={styles.reset} disabled={saving || resetting}
          onPress={() => router.push({ pathname: '/event/[eventId]', params: { eventId: eventWithRoute.id } })}>
          <Text style={styles.buttonText}>Dev: event with route</Text>
        </Pressable>
      ) : null}
      <Text style={styles.message}>
        Campus time (ET) comes from {easternClock.source === 'intl' ? 'the phone’s time-zone data' : 'built-in US daylight-time rules'}.
      </Text>
      <Pressable accessibilityRole="button" style={styles.reset} disabled={saving || resetting}
        onPress={() => Alert.alert('Reset demo on this device?', 'Sign out, and clear every account’s registrations record, saved events, swipe history and upload history on this phone, plus the saved server address. Server records stay on the server.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset', style: 'destructive', onPress: () => {
            setResetting(true);
            void resetDemo().then(
              () => Alert.alert('Demo reset', 'This phone is ready for another walkthrough.'),
              () => { setResetting(false); Alert.alert('Could not reset the demo', 'Please try again.'); },
            );
          } },
        ])}>
        <Text style={styles.buttonText}>{resetting ? 'Resetting…' : 'Reset demo'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.paper },
  container: { padding: 24 },
  title: { color: palette.ink, fontSize: 24, fontWeight: '700' },
  body: { color: palette.muted, marginTop: 8, fontSize: 15, lineHeight: 21 },
  input: { marginTop: 20, borderWidth: 1, borderColor: '#c5ced5', borderRadius: 8, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 11, color: palette.ink },
  button: { marginTop: 14, paddingVertical: 12, borderRadius: 8, backgroundColor: palette.gold, alignItems: 'center' },
  buttonText: { color: palette.ink, fontWeight: '700' },
  reset: { marginTop: 18, alignItems: 'center', padding: 12, borderRadius: 8, borderColor: '#8999a4', borderWidth: 1 },
  message: { color: palette.muted, marginTop: 12, minHeight: 20 },
});
