import type { Route, Step } from '../../../shared/types.ts';

export type TurnDirection = Extract<Step, { type: 'turn' }>['direction'];
export type StepEdit = { kind: 'turn'; direction: TurnDirection } | { kind: 'approve' } | { kind: 'delete' };
export type ReviewAction = { kind: 'save'; steps: Step[] } | { kind: 'confirm' };

export function nextIssue(route: Route, after: number): number {
  const flagged = new Set(route.checks.filter(check => check.level !== 'pass').map(check => check.stepId));
  const next = route.steps.findIndex((step, index) => index > after && flagged.has(step.id));
  return next >= 0 ? next : route.steps.findIndex(step => flagged.has(step.id));
}

export function canConfirm(route: Route): boolean {
  return route.status === 'draft' && !route.checks.some(check => check.level === 'fail');
}

export function editSteps(steps: Step[], index: number, edit: StepEdit): Step[] {
  const step = steps[index];
  if (!step) return steps;
  if (edit.kind === 'delete') {
    if (index === 0 || index === steps.length - 1) return steps;
    return steps.filter((_, position) => position !== index);
  }
  let replacement: Step = { ...step, source: 'organizer' };
  if (edit.kind === 'turn') {
    if (step.type !== 'turn') return steps;
    replacement = { ...step, source: 'organizer', direction: edit.direction };
  }
  return steps.map((item, position) => position === index ? replacement : item);
}
