// DEMO-ONLY sign-in shortcuts. These are the two public demo accounts from
// server/demo_accounts.py, documented in app/README.md. They protect nothing.
// The buttons that fill the form appear only when the app was started with
// EXPO_PUBLIC_DEMO_MODE=1; without the variable they are off.

export type DemoAccount = { label: string; email: string; password: string };

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { label: 'Use demo student', email: 'student@ksu-go.example', password: 'StudentDemo!26' },
  { label: 'Use demo organizer', email: 'organizer@ksu-go.example', password: 'OrganizerDemo!26' },
];

export function isDemoMode(value: string | undefined): boolean {
  return value === '1';
}

// Expo inlines EXPO_PUBLIC_ variables only when they are read by their full name.
export const DEMO_MODE = isDemoMode(process.env.EXPO_PUBLIC_DEMO_MODE);
