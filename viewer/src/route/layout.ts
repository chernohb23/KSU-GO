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
  /** Union of the corridor rectangles around this floor's walks. */
  footprint: Polygon[];
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

/** Lays out a route as turtle graphics, following CONTRACTS.md section 4. */
export function layoutRoute(route: Route): RouteLayout {
  const width = route.corridorWidthM;
  const floors: FloorLayout[] = [];
  const floorIndex = (name: string, y: number): number => {
    const found = floors.find((floor) => floor.name === name);
    if (found) return found.index;
    floors.push({ index: floors.length, name, y, footprint: [] });
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

  for (const step of route.steps) {
    const start = here();
    const headingStart = quarters * (Math.PI / 2);
    const floorStart = floor;
    const [dx, dz] = direction(quarters);

    switch (step.type) {
      case "walk":
        x += dx * step.lengthM;
        z += dz * step.lengthM;
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

  return { steps, centerline, floors };
}
