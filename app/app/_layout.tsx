import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AccountProvider } from '../src/account/AccountProvider';
import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { AppDataProvider } from '../src/data/AppDataProvider';
import { AppTitle, headerStyles, useOfflineHeaderRight, useOfflineNativeHeaderItems } from '../src/navigation/AppHeader';
import { LaunchScreen } from '../src/navigation/Brand';
import { showsSignIn } from '../src/navigation/access';
import { tone } from '../src/navigation/theme';
import { OrganizationsProvider } from '../src/orgs/OrganizationsProvider';
import { DemoSessionProvider } from '../src/settings/DemoSession';
import { AccessibilityProvider } from '../src/ui/accessibility';

function AppStack() {
  const { state } = useAuth();
  const signedOut = showsSignIn(state);
  const headerRight = useOfflineHeaderRight();
  const headerItems = useOfflineNativeHeaderItems();
  return (
    <>
      <Stack screenOptions={{
        headerTitleAlign: 'center',
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        headerLargeTitle: false,
        headerRight,
        unstable_headerRightItems: headerItems,
        headerStyle: headerStyles.header,
        headerTintColor: tone.amber,
        headerBackButtonDisplayMode: 'minimal',
      }}>
        <Stack.Protected guard={signedOut}>
          <Stack.Screen name="sign-in" options={{
            headerTitle: () => <AppTitle variant="ink" settingsShortcut />,
            headerStyle: { backgroundColor: tone.ink },
            headerShadowVisible: false,
          }} />
          <Stack.Screen name="sign-up" options={{
            headerTitle: () => <AppTitle variant="ink" />,
            headerStyle: { backgroundColor: tone.ink },
            headerTintColor: tone.gold,
            headerShadowVisible: false,
          }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedOut}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="event/[eventId]" options={{ headerTitle: 'Event' }} />
          <Stack.Screen name="route/[routeId]" options={{ headerTitle: 'Directions' }} />
          <Stack.Screen name="org/[orgId]" options={{ headerTitle: 'Organization' }} />
          <Stack.Screen name="new-organization" options={{ headerTitle: 'Create organization' }} />
          <Stack.Screen name="edit-profile" options={{ headerTitle: 'Edit profile' }} />
        </Stack.Protected>
        <Stack.Screen name="settings" options={{ headerTitle: 'Settings', headerRight: undefined, unstable_headerRightItems: undefined }} />
      </Stack>
      {state.status === 'restoring' ? (
        <View style={StyleSheet.absoluteFill}><LaunchScreen label="Opening KSU-GO…" /></View>
      ) : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AccessibilityProvider>
      <DemoSessionProvider>
        <AppDataProvider>
          <AuthProvider>
            <AccountProvider>
              <OrganizationsProvider><AppStack /></OrganizationsProvider>
            </AccountProvider>
          </AuthProvider>
        </AppDataProvider>
      </DemoSessionProvider>
      </AccessibilityProvider>
    </GestureHandlerRootView>
  );
}
