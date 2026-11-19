import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { stepInstruction } from '../../../../shared/instructions';
import { useOrganizer } from '../../../src/organizer/context';
import { Action, buildingName, ProgressBar, styles } from '../../../src/organizer/ui';

export default function OrganizerRouteScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const router = useRouter();
  const { session, routes, readErrors, storageNotice } = useOrganizer();
  const [lookedUp, setLookedUp] = useState('');
  const route = routes[routeId];

  useEffect(() => {
    let active = true;
    void session.read(routeId).then(() => { if (active) setLookedUp(routeId); });
    return () => { active = false; };
  }, [routeId, session]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Action label="Back to drafts" secondary onPress={() => router.dismissTo('/organizer')} />
      {storageNotice && <Text accessibilityRole="alert" style={styles.notice}>{storageNotice}</Text>}
      {readErrors[routeId] && <Text accessibilityRole="alert" style={styles.notice}>{readErrors[routeId]}</Text>}
      {!route ? (
        <Text style={styles.body}>{lookedUp === routeId ? 'This route is unavailable.' : 'Loading route…'}</Text>
      ) : (
        <>
          <Text accessibilityRole="header" style={styles.title}>{route.destination}</Text>
          <Text style={styles.body}>{buildingName(route.buildingId)} · Floor {route.startFloor} → {route.destinationFloor}</Text>
          {route.status === 'processing' && (
            <View style={styles.card}>
              <Text style={styles.heading}>Processing video</Text>
              {route.progress && <ProgressBar label={route.progress.stage} percent={route.progress.pct} />}
            </View>
          )}
          {route.status === 'failed' && (
            <View style={styles.card}>
              <Text style={styles.heading}>Processing failed</Text>
              <Text accessibilityRole="alert" style={styles.notice}>{route.error ?? 'Choose a video and upload it again.'}</Text>
            </View>
          )}
          {route.status === 'draft' && (
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.heading}>Review draft</Text>
              {route.steps.map((step, index) => (
                <Text key={step.id} style={styles.body}>{index + 1}. {stepInstruction(route, index)}</Text>
              ))}
            </View>
          )}
          {route.status === 'confirmed' && <Text style={styles.label}>Route confirmed</Text>}
        </>
      )}
    </ScrollView>
  );
}
