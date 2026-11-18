import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppData } from '../src/data/AppDataContext';

export default function SettingsScreen() {
  const { serverUrl, setServerUrl } = useAppData();
  const [url, setUrl] = useState(serverUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => setUrl(serverUrl ?? ''), [serverUrl]);

  async function save() {
    setSaving(true);
    setMessage('Checking server…');
    try {
      await setServerUrl(url);
      setMessage('Server address saved.');
    } catch {
      setMessage('Could not save the server address.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Server settings</Text>
      <Text style={styles.body}>Set a tunnel or local server address. Leave blank to use EXPO_PUBLIC_API_URL, if set.</Text>
      <TextInput
        accessibilityLabel="Server URL"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onChangeText={setUrl}
        placeholder="https://example-tunnel.ngrok.app"
        value={url}
        style={styles.input}
      />
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={styles.button}>
        <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save server address'}</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
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
  message: { color: '#53616c', marginTop: 12, minHeight: 20 },
});
