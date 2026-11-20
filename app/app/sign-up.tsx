import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { AuthScreen, Field, FieldGroup, FormMessage, PrimaryButton, TextButton, type FieldHandle } from '../src/auth/AuthScreen';
import { useAuth } from '../src/auth/AuthProvider';
import { AuthFormError } from '../src/auth/controller';

export default function SignUpScreen() {
  const router = useRouter();
  const { controller } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailField = useRef<FieldHandle>(null);
  const passwordField = useRef<FieldHandle>(null);

  async function signUp() {
    setError(null);
    setBusy(true);
    try {
      await controller.signUp(name, email, password);
    } catch (problem) {
      setError(problem instanceof AuthFormError ? problem.message : 'Could not create the account. Try again.');
      setBusy(false);
    }
  }

  return (
    <AuthScreen headline="Create an account.">
      <FieldGroup>
        <Field label="Name" value={name} onChangeText={setName} textContentType="name" autoComplete="name"
          returnKeyType="next" onSubmitEditing={() => emailField.current?.focus()} editable={!busy} />
        <Field ref={emailField} label="Email" value={email} onChangeText={setEmail} autoCapitalize="none"
          autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="email"
          returnKeyType="next" onSubmitEditing={() => passwordField.current?.focus()} editable={!busy} />
        <Field ref={passwordField} label="Password" value={password} onChangeText={setPassword} secureTextEntry
          textContentType="newPassword" autoComplete="new-password" returnKeyType="go" placeholder="At least 8 characters"
          onSubmitEditing={() => void signUp()} editable={!busy} last />
      </FieldGroup>
      <FormMessage message={error} />
      <PrimaryButton label="Create account" busy={busy} disabled={!name.trim() || !email.trim() || !password}
        onPress={() => void signUp()} />
      <TextButton label="I already have an account" onPress={() => router.back()} />
    </AuthScreen>
  );
}
