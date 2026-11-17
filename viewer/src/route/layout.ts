import { union } from "polygon-clipping";
import type { Route } from "../../../shared/types";

/** `[x, y, z]` in meters; `y` is up. */
export type Vec3 = [number, number, number];
/** `[x, z]` points of one ring. */
export type Ring = [number, number][];
/** Outer ring first, then any holes. */
export type Polygon = Ring[];

export type StepLayout = {
  stepId: string;
  start: Vec3;
  end: Vec3;
  /**
   * Radians, as three.js `rotation.y`: 0 faces `-z`, a left turn adds π/2.
   * Headings accumulate and are never wrapped, so interpolating from
   * `headingStart` to `headingEnd` always turns the way the step turns.
   */
  headingStart: number;
  headingEnd: number;
  /** Index into `RouteLayout.floors`. */
  floorStart: number;
  floorEnd: number;
};

export type FloorLayout = {
  /** Order in which the route first reaches this floor. */
  index: number;
  name: string;
  /** Height where the route first reached this floor. */
  y: number;
  /** Union of the corridor rectangles around this floor's walks at height `y`. */
  footprint: Polygon[];
  /**
   * Walks on this floor at another height, such as a walk on a stair landing
   * before `toFloor` is reached, grouped by height and sorted by `y`.
   */
  landings: { y: number; footprint: Polygon[] }[];
};

export type RouteLayout = {
  steps: StepLayout[];
  /** Start point, then the end of every step that moves. */
  centerline: Vec3[];
  floors: FloorLayout[];
};

const FLOOR_HEIGHT_M = 3.6;
const WHOLE_NUMBER = /^-?\d+$/;

/** Unit `[dx, dz]` for a heading counted in quarter turns to the left of `-z`. */
function direction(quarters: number): [number, number] {
  switch (((quarters % 4) + 4) % 4) {
    case 0: return [0, -1];
    case 1: return [-1, 0];
    case 2: return [0, 1];
    default: return [1, 0];
  }
}

function elevatorRise(from: string, to: string): number {
  return WHOLE_NUMBER.test(from) && WHOLE_NUMBER.test(to)
    ? (Number(to) - Number(from)) * FLOOR_HEIGHT_M
    : FLOOR_HEIGHT_M;
}

const isLength = (value: number) => Number.isFinite(value) && value >= 0;

/** Throws only on input the contract does not allow; odd but legal step lists pass. */
function assertValid(route: Route) {
  if (route.steps.length === 0) throw new Error("Route has no steps to lay out.");
  if (!Number.isFinite(route.corridorWidthM) || route.corridorWidthM <= 0) {
    throw new Error(`Route corridorWidthM must be a positive number, got ${route.corridorWidthM}.`);
  }
  for (const step of route.steps) {
    const lengths = step.type === "walk" ? { lengthM: step.lengthM }
      : step.type === "stairs" ? { riseM: step.riseM, runM: step.runM }
      : {};
    for (const [name, value] of Object.entries(lengths)) {
      if (!isLength(value)) {
        throw new Error(`Step ${step.id} has ${name} ${value}; it must be a finite number of 0 or more.`);
      }
    }
  }
}

/** Lays out a route as turtle graphics, following CONTRACTS.md section 4. */
export function layoutRoute(route: Route): RouteLayout {
  assertValid(route);
  const width = route.corridorWidthM;
  const floors: FloorLayout[] = [];
  const floorIndex = (name: string, y: number): number => {
    const found = floors.find((floor) => floor.name === name);
    if (found) return found.index;
    floors.push({ index: floors.length, name, y, footprint: [], landings: [] });
    return floors.length - 1;
  };

  let x = 0;
  let y = 0;
  let z = 0;
  let quarters = 0;
  let floorName = route.startFloor;
  let floor = floorIndex(floorName, y);
  // `+ 0` turns -0 into 0 so results compare cleanly.
  const here = (): Vec3 => [x + 0, y + 0, z + 0];

  const steps: StepLayout[] = [];
  const centerline: Vec3[] = [here()];
  const corridors: { y: number; polygon: Polygon }[][] = [];

  for (const [i, step] of route.steps.entries()) {
    const start = here();
    const headingStart = quarters * (Math.PI / 2);
    const floorStart = floor;
    const [dx, dz] = direction(quarters);

    switch (step.type) {
      case "walk":
        x += dx * step.lengthM;
        z += dz * step.lengthM;
        (corridors[floor] ??= []).push({
          y: start[1],
          polygon: corridor(start, here(), [dx, dz], width, {
            start: joinsWalk(route, i, -1),
            end: joinsWalk(route, i, 1),
          }),
        });
        break;
      case "turn": {
        if (step.direction === "left") quarters += 1;
        else if (step.direction === "right") quarters -= 1;
        else {
          const side = step.direction === "u_left" ? 1 : -1;
          const [sx, sz] = direction(quarters + side);
          x += sx * width;
          z += sz * width;
          quarters += 2 * side;
        }
        break;
      }
      case "stairs":
        x += dx * step.runM;
        z += dz * step.runM;
        y += step.direction === "up" ? step.riseM : -step.riseM;
        if (step.toFloor !== null) {
          floorName = step.toFloor;
          floor = floorIndex(floorName, y);
        }
        break;
      case "elevator":
        y += elevatorRise(floorName, step.toFloor);
        floorName = step.toFloor;
        floor = floorIndex(floorName, y);
        break;
      case "door":
        break;
    }

    const end = here();
    steps.push({
      stepId: step.id,
      start,
      end,
      headingStart,
      headingEnd: quarters * (Math.PI / 2),
      floorStart,
      floorEnd: floor,
    });
    const previous = centerline[centerline.length - 1];
    if (end.some((v, i) => v !== previous[i])) centerline.push(end);
  }

  for (const floorLayout of floors) {
    // Group by height to the millimetre, so 1.7 + 1.9 and 3.6 land together.
    const byHeight = new Map<number, { y: number; polygons: Polygon[] }>();
    for (const { y: walkY, polygon } of corridors[floorLayout.index] ?? []) {
      const key = Math.round(walkY * 1000);
      const group = byHeight.get(key) ?? { y: walkY, polygons: [] };
      group.polygons.push(polygon);
      byHeight.set(key, group);
    }
    const floorKey = Math.round(floorLayout.y * 1000);
    for (const [key, { y: groupY, polygons: [first, ...rest] }] of byHeight) {
      const footprint = union(first, ...rest);
      if (key === floorKey) floorLayout.footprint = footprint;
      else floorLayout.landings.push({ y: groupY, footprint });
    }
    floorLayout.landings.sort((a, b) => a.y - b.y);
  }

  return { steps, centerline, floors };
}

/**
 * True when the walk at `index` meets another walk in `step` direction (-1 back, 1 ahead)
 * with only turns and doors between them, so its corridor must reach the corner.
 */
function joinsWalk(route: Route, index: number, step: -1 | 1): boolean {
  let j = index + step;
  while (route.steps[j]?.type === "turn" || route.steps[j]?.type === "door") j += step;
  return route.steps[j]?.type === "walk";
}

/**
 * The walk's corridor, `width` wide. An end that joins another walk reaches `width / 2`
 * further so the corner has no notch; an end at stairs, an elevator or the route's end stops
 * exactly there, so the slab never covers a flight or pokes out behind a door.
 */
function corridor(
  start: Vec3,
  end: Vec3,
  [dx, dz]: [number, number],
  width: number,
  extend: { start: boolean; end: boolean },
): Polygon {
  const half = width / 2;
  const back = extend.start ? half : 0;
  const ahead = extend.end ? half : 0;
  const [ax, az] = [start[0] - dx * back, start[2] - dz * back];
  const [bx, bz] = [end[0] + dx * ahead, end[2] + dz * ahead];
  // Sideways offset, perpendicular to the walk.
  const [sx, sz] = [-dz * half, dx * half];
  return [[
    [ax + sx, az + sz], [bx + sx, bz + sz], [bx - sx, bz - sz], [ax - sx, az - sz],
  ]];
}
