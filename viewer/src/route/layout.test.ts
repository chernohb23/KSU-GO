import { describe, expect, it } from "vitest";
import flawedJson from "../../../shared/fixtures/route.draft-flawed.json";
import sampleJson from "../../../shared/fixtures/route.sample.json";
import type { Route, Step } from "../../../shared/types";
import { layoutRoute, type Polygon, type Ring, type RouteLayout, type Vec3 } from "./layout";

const sample = sampleJson as Route;
const HALF_PI = Math.PI / 2;

type StepInput =
  | { type: "walk"; lengthM: number }
  | { type: "turn"; direction: "left" | "right" | "u_left" | "u_right" }
  | { type: "stairs"; direction: "up" | "down"; riseM: number; runM: number; toFloor: string | null }
  | { type: "elevator"; toFloor: string }
  | { type: "door"; label: string | null };

const walk = (lengthM: number): StepInput => ({ type: "walk", lengthM });
const turn = (direction: "left" | "right" | "u_left" | "u_right"): StepInput => ({ type: "turn", direction });
const stairs = (direction: "up" | "down", toFloor: string | null, riseM = 1.8, runM = 3): StepInput =>
  ({ type: "stairs", direction, riseM, runM, toFloor });
const elevator = (toFloor: string): StepInput => ({ type: "elevator", toFloor });

/** A route whose steps are the given ones between two doors (unless `doors: false`). */
function route(steps: StepInput[], overrides: Partial<Route> = {}, doors = true): Route {
  const body = doors
    ? [{ type: "door", label: "Main entrance" } as StepInput, ...steps, { type: "door", label: "Room 204" } as StepInput]
    : steps;
  return {
    ...sample,
    checks: [],
    ...overrides,
    steps: body.map((step, i): Step => ({
      id: `s${i + 1}`, source: "organizer", confidence: null, tSec: null, note: null, ...step,
    })),
  };
}

function expectVec(actual: Vec3, expected: Vec3) {
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));
}

const last = (layout: RouteLayout) => layout.steps[layout.steps.length - 1];
const byId = (layout: RouteLayout, id: string) => layout.steps.find((s) => s.stepId === id)!;

describe("layoutRoute poses", () => {
  it("walks straight ahead along -z from the origin", () => {
    const layout = layoutRoute(route([walk(5)]));
    expect(last(layout).end).toEqual([0, 0, -5]);
    expect(last(layout).headingEnd).toBe(0);
    expect(layout.steps[0].start).toEqual([0, 0, 0]);
  });

  it("turns left counter-clockwise seen from above", () => {
    const layout = layoutRoute(route([walk(2), turn("left"), walk(3)]));
    expectVec(last(layout).end, [-3, 0, -2]);
    expect(last(layout).headingEnd).toBeCloseTo(HALF_PI);
  });

  it("turns right clockwise seen from above", () => {
    const layout = layoutRoute(route([walk(2), turn("right"), walk(3)]));
    expectVec(last(layout).end, [3, 0, -2]);
    expect(last(layout).headingEnd).toBeCloseTo(-HALF_PI);
  });

  it("u_left reverses and shifts one corridor width to the left", () => {
    const layout = layoutRoute(route([walk(2), turn("u_left"), walk(2)]));
    expectVec(layout.steps[2].start, [0, 0, -2]);
    expectVec(layout.steps[2].end, [-2, 0, -2]);
    expect(layout.steps[2].headingStart).toBe(0);
    expect(layout.steps[2].headingEnd).toBeCloseTo(Math.PI);
    expectVec(last(layout).end, [-2, 0, 0]);
  });

  it("u_right reverses and shifts one corridor width to the right", () => {
    const layout = layoutRoute(route([walk(2), turn("u_right"), walk(2)]));
    expectVec(layout.steps[2].end, [2, 0, -2]);
    expect(layout.steps[2].headingEnd).toBeCloseTo(-Math.PI);
    expectVec(last(layout).end, [2, 0, 0]);
  });

  it("climbs stairs forward and up, changing floor at toFloor", () => {
    const layout = layoutRoute(route([stairs("up", "2")]));
    const flight = layout.steps[1];
    expectVec(flight.end, [0, 1.8, -3]);
    expect(flight.floorStart).toBe(0);
    expect(flight.floorEnd).toBe(1);
    expect(layout.floors.map(({ index, name, y }) => ({ index, name, y })))
      .toEqual([{ index: 0, name: "1", y: 0 }, { index: 1, name: "2", y: 1.8 }]);
  });

  it("goes down stairs below the start floor", () => {
    const layout = layoutRoute(route([stairs("down", "0")]));
    expectVec(layout.steps[1].end, [0, -1.8, -3]);
    expect(layout.floors[1]).toMatchObject({ name: "0", y: -1.8 });
  });

  it("keeps the position through an elevator, 3.6 m per whole floor", () => {
    const layout = layoutRoute(route([walk(2), elevator("3"), walk(2)]));
    expectVec(layout.steps[2].start, [0, 0, -2]);
    expectVec(layout.steps[2].end, [0, 7.2, -2]);
    expectVec(layout.steps[3].start, [0, 7.2, -2]);
    expect(layout.steps[2].floorEnd).toBe(1);
    expect(layout.floors[1]).toMatchObject({ name: "3", y: 7.2 });
  });

  it("takes an elevator down to a basement", () => {
    const layout = layoutRoute(route([elevator("-1")]));
    expectVec(layout.steps[1].end, [0, -7.2, 0]);
  });

  it("goes up 3.6 m when either elevator floor is not a whole number", () => {
    expectVec(layoutRoute(route([elevator("M")])).steps[1].end, [0, 3.6, 0]);
    expectVec(layoutRoute(route([elevator("2")], { startFloor: "G" })).steps[1].end, [0, 3.6, 0]);
  });

  it("lists a floor reached without walking on it, with an empty footprint", () => {
    const layout = layoutRoute(route([walk(2), elevator("3")]));
    expect(layout.floors[1]).toEqual({ index: 1, name: "3", y: 7.2, footprint: [], landings: [] });
  });

  it("keeps a walk on a stair landing at the landing's height, not the floor's", () => {
    const layout = layoutRoute(route([stairs("up", null), walk(2), stairs("up", "2")]));
    const [ground, upper] = layout.floors;
    expect(ground.footprint).toEqual([]);
    expect(ground.landings).toHaveLength(1);
    expect(ground.landings[0].y).toBeCloseTo(1.8);
    expect(ground.landings[0].footprint).toHaveLength(1);
    expect(area(ground.landings[0].footprint[0])).toBeCloseTo(4);
    expect(upper.footprint).toEqual([]);
    expect(upper.landings).toEqual([]);
  });

  it("reuses a floor's entry when the route comes back to it", () => {
    const layout = layoutRoute(route([stairs("up", "2"), stairs("down", "1")]));
    expect(layout.floors).toHaveLength(2);
    expect(last(layout).floorEnd).toBe(0);
  });
});

describe("layoutRoute on the sample route", () => {
  const layout = layoutRoute(sample);

  it("ends at Room 204 on floor 2", () => {
    expectVec(last(layout).end, [3, 3.6, 8]);
    expect(layout.floors[last(layout).floorEnd].name).toBe("2");
  });

  it("draws the centerline through every corner, landing and flight", () => {
    const expected: Vec3[] = [
      [0, 0, 0], [0, 0, -8], [5, 0, -8], [8, 1.8, -8], [8, 1.8, -6], [5, 3.6, -6], [3, 3.6, -6], [3, 3.6, 8],
    ];
    expect(layout.centerline).toHaveLength(expected.length);
    layout.centerline.forEach((point, i) => expectVec(point, expected[i]));
  });

  it("changes floor on the second flight and accumulates headings", () => {
    expect(byId(layout, "s7")).toMatchObject({ floorStart: 0, floorEnd: 1 });
    expect(byId(layout, "s5")).toMatchObject({ floorStart: 0, floorEnd: 0 });
    expect(byId(layout, "s3").headingEnd).toBeCloseTo(-HALF_PI);
    expect(byId(layout, "s6").headingEnd).toBeCloseTo(-3 * HALF_PI);
    expect(byId(layout, "s9").headingEnd).toBeCloseTo(-Math.PI);
  });

  it("keeps the two stair flights apart in plan view", () => {
    const first = byId(layout, "s5");
    const second = byId(layout, "s7");
    // Both flights run along x; their centerlines must be a corridor width apart in z.
    expect(first.start[2]).toBeCloseTo(first.end[2]);
    expect(second.start[2]).toBeCloseTo(second.end[2]);
    expect(Math.abs(first.start[2] - second.start[2])).toBeGreaterThanOrEqual(sample.corridorWidthM);
  });
});

/** Shoelace area of a ring, whichever way it winds. */
function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    sum += x1 * z2 - x2 * z1;
  }
  return Math.abs(sum) / 2;
}

/** Outer ring area minus its holes. */
const area = ([outer, ...holes]: Polygon) =>
  ringArea(outer) - holes.reduce((total, hole) => total + ringArea(hole), 0);

/** `[minX, maxX, minZ, maxZ]` of a polygon's outer ring. */
function bounds([outer]: Polygon): [number, number, number, number] {
  const xs = outer.map(([x]) => x);
  const zs = outer.map(([, z]) => z);
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
}

describe("layoutRoute footprints", () => {
  it("covers a straight walk between doors exactly, with no stub past either door", () => {
    const [polygon, ...rest] = layoutRoute(route([walk(5)])).floors[0].footprint;
    expect(rest).toEqual([]);
    expect(polygon).toHaveLength(1);
    expect(area(polygon)).toBeCloseTo(10);
    expect(bounds(polygon)).toEqual([-1, 1, -5, 0]);
  });

  it("fills the outside of an L corner with no notch", () => {
    const footprint = layoutRoute(route([walk(4), turn("right"), walk(4)])).floors[0].footprint;
    expect(footprint).toHaveLength(1);
    expect(area(footprint[0])).toBeCloseTo(16);
    expect(footprint[0][0]).toContainEqual([-1, -5]);
  });

  it("keeps the hole inside a corridor loop", () => {
    const loop = [walk(4), turn("left"), walk(4), turn("left"), walk(4), turn("left"), walk(4)];
    const footprint = layoutRoute(route(loop)).floors[0].footprint;
    expect(footprint).toHaveLength(1);
    expect(footprint[0]).toHaveLength(2);
    // 6 x 6 outside, minus the 2 x 2 hole, minus the 1 x 1 corner where the loop closes on the doors.
    expect(area(footprint[0])).toBeCloseTo(31);
  });

  it("gives each sample floor one corridor shape", () => {
    const [ground, upper] = layoutRoute(sample).floors;
    expect(ground.footprint).toHaveLength(1);
    expect(area(ground.footprint[0])).toBeCloseTo(26);
    expect(upper.footprint).toHaveLength(1);
    expect(area(upper.footprint[0])).toBeCloseTo(32);
    expect([ground.landings, upper.landings]).toEqual([[], []]);
  });

  it("stops corridors at the stairwell and the entrance in the sample", () => {
    const [ground, upper] = layoutRoute(sample).floors;
    // Floor 1 runs from the entrance (z 0) to the bottom of the flight (x 5).
    const [, groundMaxX, , groundMaxZ] = bounds(ground.footprint[0]);
    expect(groundMaxX).toBeCloseTo(5);
    expect(groundMaxZ).toBeCloseTo(0);
    // Floor 2 starts at the top of the flight (x 5), not over its last metre.
    expect(bounds(upper.footprint[0])[1]).toBeCloseTo(5);
  });
});

describe("layoutRoute input checks", () => {
  it("throws on a route with no steps", () => {
    expect(() => layoutRoute({ ...sample, steps: [] })).toThrow(/no steps/i);
  });

  it("throws on negative lengths, naming the step", () => {
    expect(() => layoutRoute(route([walk(-1)]))).toThrow(/s2/);
    expect(() => layoutRoute(route([stairs("up", "2", -1, 3)]))).toThrow(/s2/);
    expect(() => layoutRoute(route([stairs("up", "2", 1.8, -1)]))).toThrow(/s2/);
  });

  it("throws on numbers that are not finite, naming the step", () => {
    expect(() => layoutRoute(route([walk(Number.NaN)]))).toThrow(/s2/);
    expect(() => layoutRoute(route([stairs("up", "2", 1.8, Number.POSITIVE_INFINITY)]))).toThrow(/s2/);
  });

  it("throws on a corridor width that is not a positive number", () => {
    expect(() => layoutRoute(route([walk(2)], { corridorWidthM: 0 }))).toThrow(/corridorWidthM/);
    expect(() => layoutRoute(route([walk(2)], { corridorWidthM: Number.NaN }))).toThrow(/corridorWidthM/);
  });
});

describe("layoutRoute on odd but legal routes", () => {
  it("lays out the flawed draft fixture", () => {
    const layout = layoutRoute(flawedJson as Route);
    expectVec(last(layout).end, [2.8, 3.6, -20]);
  });

  it("lays out turns next to each other", () => {
    expect(() => layoutRoute(route([turn("left"), turn("left"), turn("right"), walk(2)]))).not.toThrow();
  });

  it("lays out corridors that overlap", () => {
    const layout = layoutRoute(route([walk(4), turn("u_left"), walk(6)]));
    expect(layout.floors[0].footprint.length).toBeGreaterThan(0);
  });

  it("lays out a step list with no doors", () => {
    expectVec(last(layoutRoute(route([walk(3)], {}, false))).end, [0, 0, -3]);
  });

  it("lays out an elevator to the floor it is already on, without moving", () => {
    const layout = layoutRoute(route([elevator("1")]));
    expectVec(layout.steps[1].end, [0, 0, 0]);
    expect(layout.floors).toHaveLength(1);
  });
});
