import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { stepInstruction } from '../../../shared/instructions';
import type { Check, Route } from '../../../shared/types';
import { useAppData } from '../data/AppDataContext';
import { ViewerWebView, type ViewerWebViewHandle } from '../viewer/ViewerWebView';
import { viewerHtml } from '../viewerHtml';
import { useOrganizer } from './context';
import { canConfirm, editSteps, nextIssue, type ReviewAction, type StepEdit, type TurnDirection } from './review';
import { Action, styles } from './ui';

const source = { html: viewerHtml };
const directionLabels: [TurnDirection, string][] = [
  ['left', 'Left'], ['right', 'Right'], ['u_left', 'U-turn left'], ['u_right', 'U-turn right'],
];
const levels = { pass: 'Passed', warn: 'Warning', fail: 'Fix required' };

function CheckMessage({ check }: { check: Check }) {
  return <Text style={check.level === 'pass' ? styles.body : styles.notice}>{levels[check.level]} · {check.message}</Text>;
}

export function DraftReview({ route, back }: { route: Route; back(): void }) {
  const { session, reviews, readErrors, storageNotice } = useOrganizer();
  const { refresh, serverUrl } = useAppData();
  const router = useRouter();
  const pending = reviews[route.id];
  const busy = !!pending && !pending.error;
  const preview = useMemo(() => pending?.action.kind === 'save'
    ? { ...route, steps: pending.action.steps } : route, [route, pending?.action]);
  const load = useMemo(() => ({ type: 'route:load' as const, route: preview }), [preview]);
  const [selectedId, setSelectedId] = useState(() => {
    const first = Math.max(0, nextIssue(preview, -1));
    return preview.steps[first]?.id;
  });
  const selected = Math.max(0, preview.steps.findIndex(step => step.id === selectedId));
  const next = nextIssue(preview, selected);
  const viewer = useRef<ViewerWebViewHandle>(null);
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef(new Map<string, number>());
  const [viewerError, setViewerError] = useState(false);

  function showStep(index: number) {
    const step = preview.steps[index];
    if (!step) return;
    setSelectedId(step.id);
    const y = offsets.current.get(step.id);
    if (y !== undefined) list.current?.scrollTo({ y, animated: false });
    if (index === selected && viewer.current?.isReady()) viewer.current.send({ type: 'route:goto', stepIndex: index });
  }

  useEffect(() => {
    if (viewer.current?.isReady()) viewer.current.send({ type: 'route:goto', stepIndex: selected });
  }, [load, selected]);

  async function submit(action: ReviewAction) {
    await session.review(route.id, action);
    if (session.state.routes[route.id]?.status === 'confirmed') await refresh();
  }

  function edit(change: StepEdit) {
    const steps = editSteps(preview.steps, selected, change);
    if (change.kind === 'delete') setSelectedId(steps[Math.min(selected, steps.length - 1)]?.id);
    void submit({ kind: 'save', steps });
  }

  return (
    <View style={styles.screen}>
      <View style={local.top}>
        <View style={local.headings}>
          <Text accessibilityRole="header" style={styles.heading}>Review draft</Text>
          <Text style={styles.body}>{route.destination}</Text>
        </View>
        <Action label="Back to drafts" secondary onPress={back} />
      </View>
      <View style={local.preview}>
        <ViewerWebView ref={viewer} source={source} initialMessage={load}
          onReady={() => { setViewerError(false); viewer.current?.send({ type: 'route:goto', stepIndex: selected }); }}
          onMessage={message => { if (message.type === 'error') setViewerError(true); }}
          onError={() => setViewerError(true)} />
      </View>
      {viewerError && <Text style={styles.notice}>Route preview unavailable. You can still review the directions.</Text>}
      <ScrollView ref={list} style={local.list} contentContainerStyle={local.rows}>
        {storageNotice && <Text style={styles.notice}>{storageNotice}</Text>}
        {readErrors[route.id] && <Text style={styles.notice}>{readErrors[route.id]}</Text>}
        {route.checks.filter(check => check.stepId === null).map((check, i) =>
          <CheckMessage key={i} check={check} />)}
        {preview.steps.map((step, index) => {
          const active = index === selected;
          const checks = route.checks.filter(check => check.stepId === step.id);
          const flagged = checks.some(check => check.level !== 'pass');
          return (
            <View key={step.id} style={[styles.card, active && local.active]} onLayout={event => {
              const y = event.nativeEvent.layout.y;
              offsets.current.set(step.id, y);
              if (active) list.current?.scrollTo({ y, animated: false });
            }}>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: active }}
                style={local.step} onPress={() => showStep(index)}>
                <Text style={styles.label}>{index + 1}. {stepInstruction(preview, index)}</Text>
                {step.confidence !== null && step.confidence < 0.6 &&
                  <Text style={styles.body}>Low AI confidence · {Math.round(step.confidence * 100)}%</Text>}
                {step.source === 'organizer' && <Text style={styles.body}>Organizer reviewed</Text>}
                {checks.map((check, i) => <CheckMessage key={i} check={check} />)}
              </Pressable>
              {active && <View style={local.controls}>
                {step.type === 'turn' && directionLabels.map(([direction, label]) =>
                  <Pressable key={direction} accessibilityRole="radio" accessibilityState={{ checked: direction === step.direction, disabled: busy }}
                    disabled={busy} style={[local.choice, direction === step.direction && local.chosen]}
                    onPress={() => edit({ kind: 'turn', direction })}>
                    <Text style={styles.label}>{label}</Text>
                  </Pressable>)}
                {flagged && step.source !== 'organizer' &&
                  <Action label="Looks right" secondary disabled={busy} onPress={() => edit({ kind: 'approve' })} />}
                {index > 0 && index < preview.steps.length - 1 &&
                  <Action label="Delete step" secondary disabled={busy} onPress={() => edit({ kind: 'delete' })} />}
              </View>}
            </View>
          );
        })}
      </ScrollView>
      <View style={local.footer}>
        {pending?.error && <>
          <Text accessibilityRole="alert" style={styles.notice}>
            {pending.action.kind === 'save' ? 'Edit unsaved. ' : 'Confirmation unsuccessful. '}{pending.error}
          </Text>
          {!serverUrl && <Action label="Set server address" secondary onPress={() => router.push('/settings')} />}
          <Action label="Retry" onPress={() => { void submit(pending.action); }} />
        </>}
        {busy && <Text accessibilityLiveRegion="polite" style={styles.body}>
          {pending.action.kind === 'save' ? 'Saving edit…' : 'Confirming route…'}
        </Text>}
        {!pending && !canConfirm(route) && <Text style={styles.body}>Resolve the failed checks to confirm.</Text>}
        <View style={local.actions}>
          <Action label="Next issue" secondary disabled={next < 0} onPress={() => showStep(next)} />
          <Action label="Confirm route" disabled={!!pending || !canConfirm(route)}
            onPress={() => { void submit({ kind: 'confirm' }); }} />
        </View>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6 },
  headings: { flex: 1 },
  preview: { height: '22%', maxHeight: 200, backgroundColor: '#101820' },
  list: { flex: 1 },
  rows: { padding: 12, gap: 8 },
  step: { minHeight: 44, justifyContent: 'center', gap: 4 },
  active: { borderColor: '#805b08', backgroundColor: '#fffaf0' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderRadius: 8, borderColor: '#8999a4' },
  chosen: { backgroundColor: '#f2dfaf', borderColor: '#805b08' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  footer: { paddingHorizontal: 12, paddingVertical: 8, gap: 4, backgroundColor: '#fff' },
});
