import type { Campus, Event, Route } from '../../../shared/types.ts';

export type AppToViewerMessage =
  | { type: 'campus:load'; campus: Campus; events: Event[]; now: string; savedEventIds?: string[] }
  | { type: 'campus:select'; eventId: string | null }
  | { type: 'route:load'; route: Route }
  | { type: 'route:goto'; stepIndex: number }
  | { type: 'route:play'; playing: boolean };

export type ViewerToAppMessage =
  | { type: 'ready' }
  | { type: 'campus:flagTapped'; eventId: string }
  | { type: 'route:stepChanged'; stepIndex: number }
  | { type: 'error'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseViewerMessage(raw: string): ViewerToAppMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  if (value.type === 'ready') return { type: 'ready' };
  if (value.type === 'campus:flagTapped' && typeof value.eventId === 'string') {
    return { type: 'campus:flagTapped', eventId: value.eventId };
  }
  if (value.type === 'route:stepChanged' && typeof value.stepIndex === 'number' && Number.isInteger(value.stepIndex) && value.stepIndex >= 0) {
    return { type: 'route:stepChanged', stepIndex: value.stepIndex };
  }
  if (value.type === 'error' && typeof value.message === 'string') {
    return { type: 'error', message: value.message };
  }
  return null;
}

export function serializeAppMessage(message: AppToViewerMessage): string {
  return `window.ksugo && window.ksugo.receive(JSON.parse(${JSON.stringify(JSON.stringify(message))})); true;`;
}
