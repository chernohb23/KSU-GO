import { describe, expect, it } from "vitest";
import sampleJson from "./fixtures/route.sample.json";
import type { Route, Step } from "./types";
import { routeSummary, stepInstruction } from "./instructions";

const route = sampleJson as Route;

function oneStep(step: Step, overrides: Partial<Route> = {}): Route {
  return {
    ...route,
    destination: "Room 204",
    steps: [step],
    ...overrides,
  };
}

function step(type: Step["type"], fields: Record<string, unknown> = {}): Step {
  return {
    id: "step",
    type,
    source: "organizer",
    confidence: null,
    tSec: null,
    note: null,
    ...fields,
  } as Step;
}

describe("stepInstruction", () => {
  it("describes doors and always names the route destination on its last step", () => {
    expect(stepInstruction(oneStep(step("door", { label: "Main entrance" })), 0)).toBe("You made it! Room 204 is right here.");
    expect(stepInstruction(oneStep(step("door", { label: "Main entrance" }), { steps: [step("door", { label: "Main entrance" }), step("door", { label: "Side door" })] }), 0)).toBe("Go through the main entrance");
    expect(stepInstruction(oneStep(step("door", { label: "Wrong label" })), 0)).toBe("You made it! Room 204 is right here.");
  });

  it("welcomes arrivals using numbered and named room labels", () => {
    expect(stepInstruction(oneStep(step("door"), { destination: " 113 " }), 0)).toBe("You made it! Room 113 is right here.");
    expect(stepInstruction(oneStep(step("door"), { destination: " Atrium " }), 0)).toBe("You made it! Atrium is right here.");
  });

  it("rounds walk lengths and includes a trimmed landmark note", () => {
    expect(stepInstruction(oneStep(step("walk", { lengthM: 8.4 })), 0)).toBe("Walk 8 m");
    expect(stepInstruction(oneStep(step("walk", { lengthM: 4.6, note: " past the vending machines " })), 0)).toBe("Walk 5 m, past the vending machines");
  });

  it("describes all turn directions", () => {
    const cases = [
      ["left", "Turn left"],
      ["right", "Turn right"],
      ["u_left", "Make a U-turn to the left"],
      ["u_right", "Make a U-turn to the right"],
    ] as const;
    for (const [direction, expected] of cases) {
      expect(stepInstruction(oneStep(step("turn", { direction })), 0)).toBe(expected);
    }
  });

  it("describes stairs and elevators", () => {
    expect(stepInstruction(oneStep(step("stairs", { direction: "up", riseM: 1.8, runM: 3, toFloor: "2" })), 0)).toBe("Take the stairs up to floor 2");
    expect(stepInstruction(oneStep(step("stairs", { direction: "down", riseM: 1.8, runM: 3, toFloor: null })), 0)).toBe("Take the stairs down");
    expect(stepInstruction(oneStep(step("elevator", { toFloor: "3" })), 0)).toBe("Take the elevator to floor 3");
  });

  it("returns an empty instruction for an index outside the route", () => {
    expect(stepInstruction(route, -1)).toBe("");
    expect(stepInstruction(route, route.steps.length)).toBe("");
  });

  it("reads the sample route naturally from entrance to destination", () => {
    expect(route.steps.map((_, index) => stepInstruction(route, index))).toEqual([
      "Go through the main entrance",
      "Walk 8 m, through the lobby",
      "Turn right",
      "Walk 5 m, past the vending machines",
      "Take the stairs up",
      "Make a U-turn to the right",
      "Take the stairs up to floor 2",
      "Walk 2 m, out of the stairwell",
      "Turn left",
      "Walk 14 m, past the water fountain",
      "You made it! Room 204 is right here.",
    ]);
  });
});

describe("routeSummary", () => {
  it("totals walking and stair run distance, floor changes, and turns", () => {
    expect(routeSummary(route)).toEqual({ totalM: 35, floors: 1, turns: 3 });
  });

  it("counts numeric multi-floor changes and nonnumeric floor transitions", () => {
    const multiFloor = {
      ...route,
      startFloor: "1",
      steps: [step("elevator", { toFloor: "4" })],
    };
    expect(routeSummary(multiFloor).floors).toBe(3);
    expect(routeSummary({ ...multiFloor, startFloor: "G", steps: [step("elevator", { toFloor: "L1" })] }).floors).toBe(1);
  });
});
