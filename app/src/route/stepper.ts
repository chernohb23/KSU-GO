import { routeSummary } from '../../../shared/instructions.ts';
import type { Route } from '../../../shared/types.ts';
import type { AppToViewerMessage } from '../viewer/bridge.ts';

export type StepperState = { index: number; playing: boolean };

export type StepperAction =
  | { type: 'next' | 'back' | 'play' | 'pause' }
  | { type: 'stepChanged'; index: number }
  | { type: 'loaded'; stepCount: number };

export const initialStepperState: StepperState = { index: 0, playing: false };

/** The loaded route supplies its step count; it is not duplicated in state. */
export function stepperReducer(state: StepperState, action: StepperAction, stepCount: number): StepperState {
  const count = action.type === 'loaded' ? action.stepCount : stepCount;
  const last = Math.max(0, count - 1);
  const clamp = (index: number) => Math.max(0, Math.min(last, index));

  switch (action.type) {
    case 'loaded': return { index: 0, playing: false };
    case 'next': return { index: clamp(state.index + 1), playing: false };
    case 'back': return { index: clamp(state.index - 1), playing: false };
    case 'play': return { index: clamp(state.index), playing: count > 0 && state.index < last };
    case 'pause': return { index: clamp(state.index), playing: false };
    case 'stepChanged':
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= count) return state;
      return { index: action.index, playing: state.playing && action.index < last };
  }
}

/** Keep button state and outbound bridge messages in the same transition. */
export function stepperTransition(state: StepperState, action: StepperAction, stepCount: number): {
  state: StepperState;
  messages: AppToViewerMessage[];
} {
  const next = stepperReducer(state, action, stepCount);
  const messages: AppToViewerMessage[] = [];
  if (action.type === 'next' || action.type === 'back') {
    if (state.playing) messages.push({ type: 'route:play', playing: false });
    if (stepCount > 0) messages.push({ type: 'route:goto', stepIndex: next.index });
  } else if (action.type === 'play' || action.type === 'pause') {
    messages.push({ type: 'route:play', playing: next.playing });
  } else if (action.type === 'stepChanged' && state.playing && !next.playing) {
    messages.push({ type: 'route:play', playing: false });
  }
  return { state: next, messages };
}

export function totalWalkingDistance(route: Route): number {
  return Math.round(routeSummary(route).totalM);
}

export function isConfirmedRoute(route: Route | null): route is Route & { status: 'confirmed' } {
  return route?.status === 'confirmed';
}
