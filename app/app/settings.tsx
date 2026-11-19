import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppData } from '../src/data/AppDataContext';
import { weekChoices } from '../src/week/useWeekChoices';

export default function SettingsScreen() {
  const { serverUrl, setServerUrl, offline } = useAppData();
  const [url, setUrl] = useState(serverUrl ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
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
    <View style={styles.container}>
      <Text style={styles.title}>Server settings</Text>
      <Text style={styles.body}>Enter the API server's base address. For the PC mock server, use the Wi-Fi address ending in :8000. Leave blank to use the default.</Text>
      <TextInput
        accessibilityLabel="Server URL"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!saving}
        onChangeText={(value) => { setUrl(value); setStatus('idle'); }}
        placeholder="https://example-tunnel.ngrok.app"
        value={url}
        style={styles.input}
      />
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={styles.button}>
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
      <Pressable accessibilityRole="button" style={styles.reset}
        onPress={() => Alert.alert('Reset weekly events?', 'Clear saved events and start the swipe deck over.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset', style: 'destructive', onPress: () => {
            void weekChoices.reset().then(
              () => Alert.alert('Weekly events reset'),
              () => Alert.alert('Could not reset weekly events', 'Please try again.'),
            );
          } },
        ])}>
        <Text style={styles.buttonText}>Reset weekly events</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#f5f7f8' },
  title: { color: '#17212a', fontSize: 24, fontWeight: '700' },
  body: { color: '#53616c', marginTop: 8, fontSize: 15, lineHeight: 21 },
  input: { marginTop: 20, borderWidth: 1, borderColor: '#c5ced5', borderRadius: 8, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 11, color: '#17212a' },
  button: { marginTop: 14, paddingVertical: 12, borderRadius: 8, backgroundColor: '#e4b850', alignItems: 'center' },
  buttonText: { color: '#17212a', fontWeight: '700' },
  reset: { marginTop: 18, alignItems: 'center', padding: 12, borderRadius: 8, borderColor: '#8999a4', borderWidth: 1 },
  message: { color: '#53616c', marginTop: 12, minHeight: 20 },
});
