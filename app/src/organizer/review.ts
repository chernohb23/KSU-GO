import type { Route, Step } from '../../../shared/types.ts';

export type TurnDirection = Extract<Step, { type: 'turn' }>['direction'];
export type StepEdit =
  | { kind: 'turn'; direction: TurnDirection }
  | { kind: 'stairs_direction'; direction: 'up' | 'down'; startFloor: string }
  | { kind: 'insert_turn'; direction: TurnDirection; position: 'before' | 'after' }
  | { kind: 'split_walk'; direction: TurnDirection }
  | { kind: 'insert_elevator'; toFloor: string }
  | { kind: 'approve' }
  | { kind: 'delete' };
export type ReviewAction = { kind: 'save'; steps: Step[] } | { kind: 'confirm' };

export function nextIssue(route: Route, after: number): number {
  const flagged = new Set(route.checks.filter(check => check.level !== 'pass').map(check => check.stepId));
  const next = route.steps.findIndex((step, index) => index > after && flagged.has(step.id));
  return next >= 0 ? next : route.steps.findIndex(step => flagged.has(step.id));
}

export function canConfirm(route: Route): boolean {
  return route.status === 'draft' && !route.checks.some(check => check.level === 'fail');
}

function newId(steps: Step[], offset: number): string {
  const existing = new Set(steps.map(step => step.id));
  let number = offset;
  while (existing.has(`organizer-${number}`)) number++;
  return `organizer-${number}`;
}

function insertedBase(id: string) {
  return { id, source: 'organizer' as const, confidence: null, tSec: null, note: null };
}

function floorBefore(steps: Step[], index: number, startFloor: string): string {
  let floor = startFloor;
  for (const step of steps.slice(0, index)) {
    if (step.type === 'elevator') floor = step.toFloor;
    else if (step.type === 'stairs' && step.toFloor !== null) floor = step.toFloor;
  }
  return floor;
}

export function editSteps(steps: Step[], index: number, edit: StepEdit): Step[] {
  const step = steps[index];
  if (!step) return steps;
  if (edit.kind === 'delete') {
    if (index === 0 || index === steps.length - 1) return steps;
    return steps.filter((_, position) => position !== index);
  }
  if (edit.kind === 'insert_turn') {
    const insertAt = edit.position === 'before' ? index : index + 1;
    if (insertAt <= 0 || insertAt >= steps.length) return steps;
    const turn: Step = { ...insertedBase(newId(steps, 1)), type: 'turn', direction: edit.direction };
    return [...steps.slice(0, insertAt), turn, ...steps.slice(insertAt)];
  }
  if (edit.kind === 'split_walk') {
    if (step.type !== 'walk' || step.lengthM < 2) return steps;
    const first: Step = { ...insertedBase(newId(steps, 1)), type: 'walk', lengthM: step.lengthM / 2 };
    const afterFirst = [...steps.slice(0, index), first, ...steps.slice(index + 1)];
    const turn: Step = { ...insertedBase(newId(afterFirst, 1)), type: 'turn', direction: edit.direction };
    const second: Step = { ...insertedBase(newId([...afterFirst, turn], 1)), type: 'walk', lengthM: step.lengthM / 2 };
    return [...steps.slice(0, index), first, turn, second, ...steps.slice(index + 1)];
  }
  if (edit.kind === 'insert_elevator') {
    const insertAt = steps.length - 1;
    if (insertAt <= 0 || steps.at(-1)?.type !== 'door' || !edit.toFloor.trim()) return steps;
    const elevator: Step = { ...insertedBase(newId(steps, 1)), type: 'elevator', toFloor: edit.toFloor.trim() };
    return [...steps.slice(0, insertAt), elevator, ...steps.slice(insertAt)];
  }
  let replacement: Step = { ...step, source: 'organizer' };
  if (edit.kind === 'turn') {
    if (step.type !== 'turn') return steps;
    replacement = { ...step, source: 'organizer', direction: edit.direction };
  } else if (edit.kind === 'stairs_direction') {
    if (step.type !== 'stairs') return steps;
    const current = floorBefore(steps, index, edit.startFloor);
    const currentNumber = /^-?\d+$/.test(current) ? Number(current) : null;
    const targetNumber = step.toFloor !== null && /^-?\d+$/.test(step.toFloor) ? Number(step.toFloor) : null;
    const distance = currentNumber !== null && targetNumber !== null
      ? Math.max(1, Math.abs(targetNumber - currentNumber)) : null;
    const toFloor = distance === null || currentNumber === null ? step.toFloor
      : String(currentNumber + (edit.direction === 'up' ? distance : -distance));
    replacement = { ...step, source: 'organizer', direction: edit.direction, toFloor };
  }
  return steps.map((item, position) => position === index ? replacement : item);
}
