import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AccountProvider } from '../src/account/AccountProvider';
import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { AppDataProvider } from '../src/data/AppDataProvider';
import { AppTitle, DataSourceBadge, headerStyles } from '../src/navigation/AppHeader';
import { LaunchScreen } from '../src/navigation/Brand';
import { showsSignIn } from '../src/navigation/access';
import { tone } from '../src/navigation/theme';
import { DemoSessionProvider } from '../src/settings/DemoSession';

function AppStack() {
  const { state } = useAuth();
  const signedOut = showsSignIn(state);
  return (
    <>
      <Stack screenOptions={{
        headerTitle: () => <AppTitle />,
        headerRight: () => <DataSourceBadge />,
        headerStyle: headerStyles.header,
        headerTintColor: tone.amber,
        headerBackButtonDisplayMode: 'minimal',
      }}>
        <Stack.Protected guard={signedOut}>
          <Stack.Screen name="sign-in" options={{
            headerTitle: () => <AppTitle variant="ink" />,
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
        </Stack.Protected>
        <Stack.Screen name="settings" options={{ headerTitle: 'Settings', headerRight: () => null }} />
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
      <DemoSessionProvider>
        <AppDataProvider>
          <AuthProvider>
            <AccountProvider>
              <AppStack />
            </AccountProvider>
          </AuthProvider>
        </AppDataProvider>
      </DemoSessionProvider>
    </GestureHandlerRootView>
  );
}
