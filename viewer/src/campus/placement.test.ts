import { describe, expect, it } from "vitest";
import campus from "../../../shared/fixtures/campus.json";
import { distToRing, pointInRing, type XZ } from "./geometry";
import { roofCenter, roofPositions } from "./roof";
import { overlaps, placeLabels, type LabelCandidate } from "./labelPlacement";

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
