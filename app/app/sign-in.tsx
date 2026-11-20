import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthScreen, Field, FieldGroup, FormMessage, PrimaryButton, TextButton, type FieldHandle } from '../src/auth/AuthScreen';
import { useAuth } from '../src/auth/AuthProvider';
import { AuthFormError } from '../src/auth/controller';
import { DEMO_ACCOUNTS, DEMO_MODE } from '../src/auth/demoAccounts';
import { radius, space, text, tone } from '../src/navigation/theme';

export default function SignInScreen() {
  const router = useRouter();
  const { controller, state } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordField = useRef<FieldHandle>(null);
  const ended = state.status === 'signedOut' ? state.message : null;

  async function signIn() {
    setError(null);
    setBusy(true);
    try {
      await controller.signIn(email, password);
    } catch (problem) {
      setError(problem instanceof AuthFormError ? problem.message : 'Sign-in failed. Try again.');
      setBusy(false);
    }
  }

  return (
    <AuthScreen headline="Find the event, then the room." lede="Sign in to register and keep your events.">
      {ended && !error ? <FormMessage message={ended} tone="info" /> : null}
      <FieldGroup>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
          keyboardType="email-address" textContentType="username" autoComplete="email" returnKeyType="next"
          onSubmitEditing={() => passwordField.current?.focus()} editable={!busy} placeholder="you@example.com" />
        <Field ref={passwordField} label="Password" value={password} onChangeText={setPassword} secureTextEntry
          textContentType="password" autoComplete="current-password" returnKeyType="go"
          onSubmitEditing={() => void signIn()} editable={!busy} last />
      </FieldGroup>
      <FormMessage message={error} />
      <PrimaryButton label="Sign in" busy={busy} disabled={!email.trim() || !password} onPress={() => void signIn()} />

      {DEMO_MODE ? (
        <View style={styles.demo} accessibilityLabel="Demo accounts">
          {DEMO_ACCOUNTS.map((account) => (
            <Pressable key={account.email} accessibilityRole="button" disabled={busy}
              onPress={() => { setEmail(account.email); setPassword(account.password); setError(null); }}
              style={({ pressed }) => [styles.demoButton, pressed && styles.pressed]}>
              <Text style={styles.demoText}>{account.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.divider} />
      <TextButton label="Browse offline" onPress={() => controller.browseOffline()} />
      <Text style={styles.footnote}>Browsing offline shows this week’s events and directions from data on this phone. Registering needs an account.</Text>
      <TextButton label="New here? Create an account" onPress={() => router.push('/sign-up')} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  demo: { flexDirection: 'row', gap: space.s },
  demoButton: { flex: 1, minHeight: 44, borderRadius: radius.control, borderWidth: 1, borderColor: tone.hairline,
    backgroundColor: tone.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s },
  demoText: { ...text.subhead, color: tone.ink, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: tone.hairline },
  footnote: { ...text.footnote, textAlign: 'center', marginTop: -space.s },
});
