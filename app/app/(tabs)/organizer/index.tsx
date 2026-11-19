import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Route } from '../../../../shared/types';
import { useOrganizer } from '../../../src/organizer/context';
import { Action, buildingName, ModeSwitch, styles } from '../../../src/organizer/ui';

function statusLabel(route: Route) {
  if (route.status === 'processing') return route.progress ? `${route.progress.stage} · ${route.progress.pct}%` : 'Processing';
  if (route.status === 'failed') return 'Processing failed';
  return 'Ready to review';
}

export default function DraftsScreen() {
  const router = useRouter();
  const { routes, loaded, readErrors, storageNotice, transfer, session, turnOff } = useOrganizer();
  const visibleRoutes = Object.values(routes).filter((route) => route.status !== 'confirmed')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const hasTransfer = transfer?.phase === 'uploading' || transfer?.phase === 'error';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ModeSwitch enabled onChange={turnOff} />
      <Text accessibilityRole="header" style={styles.title}>Route drafts</Text>
      {hasTransfer ? (
        <Pressable accessibilityRole="button" style={styles.card} onPress={() => router.push('/organizer/new')}>
          <Text style={styles.label}>{transfer.input.destination}</Text>
          <Text style={styles.body}>
            {transfer.phase === 'uploading' ? `Uploading · ${transfer.percent}%` : 'Upload interrupted · Review and retry'}
          </Text>
        </Pressable>
      ) : (
        <Action label="New route" onPress={() => { session.clearTransfer(); router.push('/organizer/new'); }} />
      )}
      {storageNotice && <Text accessibilityRole="alert" style={styles.notice}>{storageNotice}</Text>}
      {Object.keys(readErrors).length > 0 && (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>Could not refresh all routes. Showing available drafts.</Text>
      )}
      {visibleRoutes.map((route) => (
        <Pressable key={route.id} accessibilityRole="button" style={styles.card}
          onPress={() => router.push({ pathname: '/organizer/[routeId]', params: { routeId: route.id } })}>
          <Text style={styles.label}>{route.destination}</Text>
          <Text style={styles.body}>{buildingName(route.buildingId)} · {statusLabel(route)}</Text>
          <Text style={styles.body}>{new Date(route.createdAt).toLocaleString()}</Text>
        </Pressable>
      ))}
      {visibleRoutes.length === 0 && (
        <View><Text style={styles.body}>{loaded ? 'No routes are waiting for review.' : 'Loading drafts…'}</Text></View>
      )}
    </ScrollView>
  );
}
