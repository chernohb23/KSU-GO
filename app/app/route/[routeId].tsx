import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, text } from '../../src/navigation/theme';
import { PressScale } from '../../src/ui/PressScale';
import { palette } from '../../src/navigation/Brand';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { stepInstruction } from '../../../shared/instructions.ts';
import type { Route } from '../../../shared/types.ts';
import { useAppData } from '../../src/data/AppDataContext';
import {
  initialStepperState, isConfirmedRoute, stepperReducer, stepperTransition, totalWalkingDistance,
  type StepperAction, type StepperState,
} from '../../src/route/stepper';
import { ViewerWebView, type ViewerWebViewHandle } from '../../src/viewer/ViewerWebView';
import type { ViewerToAppMessage } from '../../src/viewer/bridge';
import { viewerHtml } from '../../src/viewerHtml';

const viewerSource = { html: viewerHtml };

export default function RouteScreen() {
  const router = useRouter();
  const safe = useSafeAreaInsets();
  const { routeId } = useLocalSearchParams<{ routeId?: string }>();
  const { getRoute } = useAppData();
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const viewer = useRef<ViewerWebViewHandle>(null);
  const stepCount = route?.steps.length ?? 0;
  const [stepper, dispatch] = useReducer(
    (state: StepperState, action: StepperAction) => stepperReducer(state, action, stepCount),
    initialStepperState,
  );
  // Update synchronously between bridge messages and rapid taps, before React's
  // next render, so every command uses the same index as its reducer transition.
  const currentStepper = useRef(initialStepperState);

  const resetSteps = useCallback((count: number) => {
    const action: StepperAction = { type: 'loaded', stepCount: count };
    currentStepper.current = stepperReducer(currentStepper.current, action, count);
    dispatch(action);
  }, []);

  const act = useCallback((action: StepperAction) => {
    const transition = stepperTransition(currentStepper.current, action, stepCount);
    currentStepper.current = transition.state;
    dispatch(action);
    // Before ready, retain the index locally without overwriting the queued
    // route:load. onReady restores it once the scene has loaded.
    if (viewer.current?.isReady()) {
      transition.messages.forEach((message) => viewer.current?.send(message));
    }
  }, [stepCount]);

  useEffect(() => {
    let active = true;
    setRoute(null);
    setError(null);
    setViewerError(null);
    resetSteps(0);
    if (!routeId) return () => { active = false; };

    void getRoute(routeId).then((value) => {
      if (!active) return;
      if (!isConfirmedRoute(value)) {
        setError('A confirmed route is not available for this event.');
        return;
      }
      resetSteps(value.steps.length);
      setRoute(value);
    }).catch(() => {
      if (active) setError('The route could not be loaded.');
    });

    return () => { active = false; };
  }, [getRoute, resetSteps, routeId]);

  const initialMessage = useMemo(() => route ? ({ type: 'route:load' as const, route }) : undefined, [route]);

  const handleViewerReady = useCallback(() => {
    setViewerError(null);
    // ViewerWebView flushes initialMessage (route:load) before this callback,
    // including after a reload. Restore the current step and leave play paused.
    if (stepCount > 0) viewer.current?.send({ type: 'route:goto', stepIndex: currentStepper.current.index });
    act({ type: 'pause' });
  }, [act, stepCount]);

  const handleViewerError = useCallback(() => {
    setViewerError('The 3D view has a problem. You can still follow the written directions.');
    act({ type: 'pause' });
  }, [act]);

  const handleViewerMessage = useCallback((message: ViewerToAppMessage) => {
    if (message.type === 'route:stepChanged') act({ type: 'stepChanged', index: message.stepIndex });
    if (message.type === 'error') handleViewerError();
  }, [act, handleViewerError]);

  const atStart = stepper.index === 0;
  const atEnd = stepCount === 0 || stepper.index === stepCount - 1;
  const playDisabled = atEnd && !stepper.playing;

  return (
    <View style={styles.container}>
      {!routeId ? (
        <View style={styles.message}>
          <Text style={styles.title}>Directions</Text>
          <Text style={styles.body}>Choose “Take me there” on an event for directions to its room.</Text>
          <PressScale accessibilityRole="button" onPress={() => router.back()} style={styles.mapLink}>
            <Text style={styles.playButtonText}>Back</Text>
          </PressScale>
        </View>
      ) : error ? (
        <View style={styles.message}>
          <Text style={styles.title}>Directions</Text>
          <Text accessibilityRole="alert" style={styles.body}>{error}</Text>
        </View>
      ) : route ? (
        <>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>{route.destination}</Text>
            <Text style={styles.body}>≈ {totalWalkingDistance(route)} m walk</Text>
            {route.startFloor !== route.destinationFloor ? (
              <Text style={styles.floor}>Floor {route.startFloor} → {route.destinationFloor}</Text>
            ) : null}
          </View>
          <View style={styles.viewer}>
            <ViewerWebView
              key={route.id}
              ref={viewer}
              source={viewerSource}
              initialMessage={initialMessage}
              onReady={handleViewerReady}
              onMessage={handleViewerMessage}
              onError={handleViewerError}
            />
          </View>
          <ScrollView style={styles.instructionScroll} contentContainerStyle={[styles.instructions, { paddingBottom: safe.bottom + space.l }]}>
            {viewerError ? (
              <Text accessibilityLiveRegion="polite" style={styles.notice}>{viewerError}</Text>
            ) : null}
            <Text accessible accessibilityLiveRegion="polite" style={styles.instruction}>
              {stepInstruction(route, stepper.index)}
            </Text>
            <Text style={styles.counter}>Step {stepCount > 0 ? stepper.index + 1 : 0} of {stepCount}</Text>
            <View style={styles.controls}>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel="Previous route step"
                accessibilityState={{ disabled: atStart }}
                disabled={atStart}
                onPress={() => act({ type: 'back' })}
                style={[styles.button, atStart && styles.disabledButton]}
              >
                <Text style={styles.buttonText}>Back</Text>
              </PressScale>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={stepper.playing ? 'Pause route playback' : 'Play route'}
                accessibilityState={{ disabled: playDisabled, selected: stepper.playing }}
                disabled={playDisabled}
                onPress={() => act({ type: currentStepper.current.playing ? 'pause' : 'play' })}
                style={[styles.button, styles.playButton, playDisabled && styles.disabledButton]}
              >
                <Text style={styles.playButtonText}>{stepper.playing ? 'Pause' : 'Play'}</Text>
              </PressScale>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel="Next route step"
                accessibilityState={{ disabled: atEnd }}
                disabled={atEnd}
                onPress={() => act({ type: 'next' })}
                style={[styles.button, atEnd && styles.disabledButton]}
              >
                <Text style={styles.buttonText}>Next</Text>
              </PressScale>
            </View>
          </ScrollView>
        </>
      ) : (
        <View style={styles.message}>
          <Text style={styles.title}>Loading route…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101820' },
  header: { paddingHorizontal: space.gutter, paddingVertical: 16, backgroundColor: palette.paper },
  mapLink: { alignSelf: 'flex-start', marginTop: 18, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.control, backgroundColor: palette.amber },
  floor: { color: palette.muted, marginTop: 5, fontSize: 15 },
  viewer: { flex: 1, minHeight: 120 },
  instructionScroll: { flexGrow: 0, maxHeight: '45%', backgroundColor: palette.paper },
  instructions: { paddingHorizontal: 20, paddingVertical: space.l, backgroundColor: palette.paper },
  instruction: { color: palette.ink, fontSize: 22, lineHeight: 28, fontWeight: '600' },
  counter: { color: palette.muted, fontSize: 13, marginTop: 8 },
  controls: { flexDirection: 'row', gap: space.s, marginTop: 16 },
  button: { flex: 1, minHeight: 50, minWidth: 64, paddingHorizontal: 10, paddingVertical: 12, borderWidth: 1, borderColor: '#a9b5bc', borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: palette.ink, fontSize: 17, fontWeight: '700' },
  playButton: { backgroundColor: palette.amber, borderColor: palette.amber },
  playButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  disabledButton: { opacity: 0.45 },
  notice: { color: palette.amber, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  message: { flex: 1, padding: space.gutter, backgroundColor: palette.paper },
  title: { color: palette.ink, fontSize: 22, fontWeight: '700' },
  body: { color: palette.muted, marginTop: 8, fontSize: 15 },
});
