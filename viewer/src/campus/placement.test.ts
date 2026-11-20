import { describe, expect, it } from "vitest";
import campus from "../../../shared/fixtures/campus.json";
import { distToRing, pointInRing, type XZ } from "./geometry";
import { roofCenter, roofPositions } from "./roof";
import { nativeLabelLayout, overlaps, placeLabels, type LabelCandidate, type Rect } from "./labelPlacement";

describe("roof positions", () => {
  it("keeps a dense cluster inside every bundled building", () => {
    for (const building of campus.buildings) {
      const ring = building.footprint as XZ[];
      const positions = roofPositions(ring, 12);
      expect(positions[0]).toEqual(roofCenter(ring));
      expect(new Set(positions.map(point => point.join(","))).size).toBe(12);
      for (const [x, z] of positions) {
        expect(pointInRing(x, z, ring), building.name).toBe(true);
        expect(distToRing(x, z, ring), building.name).toBeGreaterThan(2.6);
      }
    }
  });
  it("finds an interior roof center in a concave L, whose bounding-box center is outside", () => {
    const ring: XZ[] = [[0, 0], [40, 0], [40, 12], [12, 12], [12, 40], [0, 40]];
    expect(pointInRing(20, 20, ring)).toBe(false);
    for (const [x, z] of roofPositions(ring, 10)) expect(pointInRing(x, z, ring)).toBe(true);
    expect(roofPositions(ring, 0)).toEqual([]);
  });
});

describe("screen-space building labels", () => {
  const building = { left: 40, top: 80, right: 120, bottom: 160 };
  const label = (id: string, priority: number): LabelCandidate => ({ id, priority, building, width: 120, height: 20 });
  it("keeps the highest-priority label when only one unobstructed position fits", () => {
    const placements = placeLabels([label("background", 1), label("selected", 100)], [building],
      { left: 20, top: 50, right: 160, bottom: 100 });
    expect([...placements.keys()]).toEqual(["selected"]);
    expect(overlaps(placements.get("selected")!, building)).toBe(false);
  });
  it("never places a label over a flag or outside the viewport", () => {
    const flag = { left: 10, top: 10, right: 155, bottom: 78 };
    const placements = placeLabels([label("club", 10)], [building, flag],
      { left: 0, top: 0, right: 400, bottom: 600 });
    expect(placements.size).toBe(1);
    for (const rect of placements.values()) {
      expect(overlaps(rect, flag)).toBe(false);
      expect(overlaps(rect, building)).toBe(false);
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(400);
    }
  });
  it("hides labels when a fully blocked viewport has no safe location", () => {
    expect(placeLabels([label("club", 1)], [{ left: 0, top: 0, right: 400, bottom: 600 }],
      { left: 0, top: 0, right: 400, bottom: 600 }).size).toBe(0);
  });
});

// Rounded screen bounds from the real default camera and bundled campus/events.
const nativeViews: { width: number; height: number; buildings: [string, number, number, number, number][]; flags: number[][] }[] = [
  { width: 390, height: 844,
    buildings: [
      ["b-mathematics", 192, 348, 279, 420],
      ["b-library", 76, 348, 186, 431],
      ["b-administration", 130, 414, 210, 472],
      ["b-student-center", 240, 380, 367, 477],
      ["b-east-building", 130, 452, 238, 547],
      ["b-norton", 23, 406, 116, 496],
      ["b-crawford", 150, 297, 223, 336]
    ],
    flags: [
      [233, 353, 252, 385],
      [236, 362, 252, 379],
      [241, 369, 257, 387],
      [126, 353, 146, 389],
      [136, 366, 152, 390],
      [120, 367, 136, 386],
      [166, 412, 186, 446],
      [300, 394, 323, 430],
      [304, 405, 321, 423],
      [181, 467, 202, 501],
      [65, 427, 84, 448],
      [183, 292, 198, 316]
    ],
  },
  { width: 430, height: 932,
    buildings: [
      ["b-mathematics", 212, 384, 308, 464],
      ["b-library", 84, 384, 206, 476],
      ["b-administration", 143, 458, 232, 521],
      ["b-student-center", 265, 420, 404, 527],
      ["b-east-building", 143, 499, 263, 604],
      ["b-norton", 26, 449, 128, 548],
      ["b-crawford", 165, 328, 246, 371]
    ],
    flags: [
      [257, 390, 278, 425],
      [260, 400, 278, 419],
      [266, 408, 284, 427],
      [138, 390, 161, 430],
      [149, 404, 168, 431],
      [132, 406, 150, 426],
      [183, 455, 205, 493],
      [330, 435, 356, 474],
      [335, 447, 354, 467],
      [199, 515, 222, 553],
      [72, 472, 92, 495],
      [202, 323, 218, 350]
    ],
  }
];

const rectFrom = ([left, top, right, bottom]: number[]): Rect => ({ left, top, right, bottom });

describe("default phone label layouts", () => {
  it.each(nativeViews)("places all seven labels without overlaps at $width x $height, with Library above Norton", view => {
    const { viewport, obstacles: controls } = nativeLabelLayout(view.width, view.height);
    const candidates: LabelCandidate[] = view.buildings.map(([id, ...bounds]) => {
      const building = campus.buildings.find(building => building.id === id)!;
      return { id, building: rectFrom(bounds), height: 20,
        width: Math.min(200, 16 + building.name.length * 5.8), priority: id === "b-mathematics" ? 100 : 20 };
    });
    const obstacles = [...controls, ...view.flags.map(rectFrom)];
    const placements = placeLabels(candidates, obstacles, viewport);
    expect(placements.size).toBe(7);
    expect(placeLabels(candidates, obstacles, viewport)).toEqual(placements);
    for (const [id, rect] of placements) {
      expect(rect.left).toBeGreaterThanOrEqual(viewport.left);
      expect(rect.right).toBeLessThanOrEqual(viewport.right);
      expect(rect.top).toBeGreaterThanOrEqual(viewport.top);
      expect(rect.bottom).toBeLessThanOrEqual(viewport.bottom);
      for (const obstacle of obstacles) expect(overlaps(rect, obstacle), id).toBe(false);
      for (const [otherId, other] of placements) if (otherId !== id) expect(overlaps(rect, other), `${id}/${otherId}`).toBe(false);
      for (const other of candidates) if (other.id !== id) expect(overlaps(rect, other.building), `${id}/${other.id} roof`).toBe(false);
    }
    const library = placements.get("b-library")!, norton = placements.get("b-norton")!;
    expect(norton.top - library.bottom).toBe(6);
    expect((library.left + library.right) / 2).toBeCloseTo((norton.left + norton.right) / 2);
  });

  it("uses the bottom left above the dock while reserving the pill and credit on the right", () => {
    const { viewport, obstacles } = nativeLabelLayout(390, 844);
    const label: LabelCandidate = { id: "corner", priority: 1, width: 120, height: 20,
      building: { left: 20, right: 140, top: 744, bottom: 754 } };
    const rect = placeLabels([label], obstacles, viewport).get(label.id)!;
    expect(rect.top).toBeGreaterThan(844 - 156);
    for (const obstacle of obstacles) expect(overlaps(rect, obstacle)).toBe(false);
  });

  it("can use its own roof as a last resort, while still protecting flags", () => {
    const viewport = { left: 0, top: 0, right: 120, bottom: 100 };
    const label: LabelCandidate = { id: "roof", priority: 1, width: 80, height: 20, building: viewport };
    const rect = placeLabels([label], [], viewport).get(label.id)!;
    expect(overlaps(rect, label.building)).toBe(true);
    const flag = { left: 0, top: 0, right: 120, bottom: 80 };
    expect(placeLabels([label], [flag], viewport).size).toBe(0);
  });

  it("keeps the previous building-relative slot through a small camera move even when a nearer slot opens", () => {
    const viewport = { left: 0, top: 0, right: 400, bottom: 600 };
    const label: LabelCandidate = { id: "steady", priority: 1, width: 120, height: 20,
      building: { left: 100, top: 200, right: 180, bottom: 260 } };
    const first = placeLabels([label], [{ left: 80, top: 170, right: 200, bottom: 190 }], viewport).get(label.id)!;
    const moved: LabelCandidate = { ...label,
      building: { left: 101, top: 200.5, right: 181, bottom: 260.5 },
      offset: { x: first.left - 140, y: first.top - 200 } };
    const next = placeLabels([moved], [], viewport).get(label.id)!;
    expect(next).toEqual({ left: first.left + 1, right: first.right + 1, top: first.top + 0.5, bottom: first.bottom + 0.5 });
  });
});
