import type { Route } from "./types";
import { roomLabel } from "./rooms.ts";

function assertNever(value: never): never {
  throw new Error(`Unknown route step: ${JSON.stringify(value)}`);
}

/** Turn one route step into the plain-language instruction shown to a traveler. */
export function stepInstruction(route: Route, stepIndex: number): string {
  const step = route.steps[stepIndex];
  if (!step) return "";

  switch (step.type) {
    case "door": {
      if (stepIndex === route.steps.length - 1) return `You made it! ${roomLabel(route.destination)} is right here.`;
      const label = step.label?.trim().toLowerCase();
      return `Go through the ${label || "door"}`;
    }
    case "walk": {
      const instruction = `Walk ${Math.round(step.lengthM)} m`;
      const note = step.note?.trim();
      return note ? `${instruction}, ${note}` : instruction;
    }
    case "turn":
      switch (step.direction) {
        case "left": return "Turn left";
        case "right": return "Turn right";
        case "u_left": return "Make a U-turn to the left";
        case "u_right": return "Make a U-turn to the right";
      }
      break;
    case "stairs":
      return `Take the stairs ${step.direction}${step.toFloor ? ` to floor ${step.toFloor}` : ""}`;
    case "elevator":
      return `Take the elevator to floor ${step.toFloor}`;
    default:
      return assertNever(step);
  }
}

function floorDistance(fromFloor: string, toFloor: string): number {
  if (fromFloor === toFloor) return 0;
  const from = Number(fromFloor);
  const to = Number(toFloor);
  if (Number.isInteger(from) && Number.isInteger(to)) return Math.abs(to - from);
  return 1;
}

/** Summarize the route distance, floor changes, and turns from its step list. */
export function routeSummary(route: Route): { totalM: number; floors: number; turns: number } {
  let totalM = 0;
  let floors = 0;
  let turns = 0;
  let currentFloor = route.startFloor;

  for (const step of route.steps) {
    switch (step.type) {
      case "walk":
        totalM += step.lengthM;
        break;
      case "stairs":
        totalM += step.runM;
        if (step.toFloor !== null) {
          floors += floorDistance(currentFloor, step.toFloor);
          currentFloor = step.toFloor;
        }
        break;
      case "elevator":
        floors += floorDistance(currentFloor, step.toFloor);
        currentFloor = step.toFloor;
        break;
      case "turn":
        turns += 1;
        break;
      case "door":
        break;
      default:
        assertNever(step);
    }
  }

  return { totalM, floors, turns };
}
