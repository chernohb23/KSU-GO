import { describe, expect, it } from "vitest";
import campus from "../../../shared/fixtures/campus.json";
import { distToRing, pointInRing, type XZ } from "./geometry";
import { roofCenter, roofPositions } from "./roof";
import { labelOpacity, nativeLabelLayout, overlaps, placeLabels, type LabelCandidate, type Rect } from "./labelPlacement";

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

const viewport: Rect = { left: 0, top: 0, right: 400, bottom: 600 };
const label = (id: string, priority = 1, x = 200, y = 300): LabelCandidate => ({
  id, priority, anchor: { x, y }, width: 120, height: 20,
});
const rectCenter = (rect: Rect) => ({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 });

describe("screen-space building labels", () => {
  it("keeps the selected building ahead of Mathematics when only one slot fits", () => {
    const placements = placeLabels([label("background"), label("b-mathematics", 100), label("selected", 1000)], [],
      { left: 140, top: 262, right: 260, bottom: 282 });
    expect([...placements.keys()]).toEqual(["selected"]);
  });

  it("keeps Mathematics ahead of other buildings when only one slot fits", () => {
    const placements = placeLabels([label("background"), label("b-mathematics", 100)], [],
      { left: 140, top: 262, right: 260, bottom: 282 });
    expect([...placements.keys()]).toEqual(["b-mathematics"]);
  });

  it("never covers flags or other labels, stays within 40px of its roof anchor and is deterministic", () => {
    const candidates = [label("a", 100), label("b", 20, 230, 300), label("c", 1, 210, 310)];
    const flag = { left: 190, top: 245, right: 210, bottom: 280 };
    const placements = placeLabels(candidates, [flag], viewport);
    expect(placements.size).toBeGreaterThan(0);
    expect(placeLabels(candidates, [flag], viewport)).toEqual(placements);
    for (const [id, rect] of placements) {
      expect(overlaps(rect, flag)).toBe(false);
      const anchor = candidates.find(candidate => candidate.id === id)!.anchor;
      const center = rectCenter(rect);
      expect(Math.hypot(center.x - anchor.x, center.y - anchor.y)).toBeLessThanOrEqual(40);
      expect(rect.left).toBeGreaterThanOrEqual(viewport.left);
      expect(rect.right).toBeLessThanOrEqual(viewport.right);
      expect(rect.top).toBeGreaterThanOrEqual(viewport.top);
      expect(rect.bottom).toBeLessThanOrEqual(viewport.bottom);
      for (const [otherId, other] of placements) if (id !== otherId) expect(overlaps(rect, other)).toBe(false);
    }
  });

  it.each([
    ["above", { left: 140, top: 262, right: 260, bottom: 282 }],
    ["below", { left: 140, top: 318, right: 260, bottom: 338 }],
    ["left", { left: 100, top: 290, right: 220, bottom: 310 }],
    ["right", { left: 180, top: 290, right: 300, bottom: 310 }],
  ] as const)("can use the nearby slot %s", (_side, slot) => {
    expect(placeLabels([label("roof")], [], slot).get("roof")).toEqual(slot);
  });

  it("allows labels over any building's roof, including their own", () => {
    const roof = { left: 100, top: 250, right: 300, bottom: 350 };
    const candidates = [label("roof"), label("other", 0, 220, 320)];
    const placements = placeLabels(candidates, [], viewport);
    expect(placements.size).toBe(2);
    for (const rect of placements.values()) expect(overlaps(rect, roof)).toBe(true);
    expect(placeLabels(candidates, [roof], viewport).size).toBe(0);
  });

  it("hides labels when a fully blocked viewport has no safe location", () => {
    expect(placeLabels([label("club")], [viewport], viewport).size).toBe(0);
  });

  it("hides edge labels instead of pulling them away from their building", () => {
    expect(placeLabels([label("edge", 1, -20, 300)], [], viewport).size).toBe(0);
  });

  it("never stacks Library on Norton when Library's own anchor is blocked", () => {
    const library = label("b-library", 1, 100, 200), norton = label("b-norton", 1, 280, 400);
    const placements = placeLabels([library, norton], [{ left: 0, top: 140, right: 200, bottom: 260 }], viewport);
    expect([...placements.keys()]).toEqual(["b-norton"]);
    expect(rectCenter(placements.get("b-norton")!)).toEqual({ x: 280, y: 372 });
  });

  it("keeps a valid roof-relative slot through small camera moves", () => {
    const original = label("steady");
    const first = placeLabels([original], [{ left: 140, top: 260, right: 260, bottom: 284 }], viewport).get(original.id)!;
    const moved = { ...original, anchor: { x: 201, y: 300.5 },
      offset: { x: first.left - 200, y: first.top - 300 } };
    expect(placeLabels([moved], [], viewport).get(moved.id)).toEqual({
      left: first.left + 1, right: first.right + 1, top: first.top + 0.5, bottom: first.bottom + 0.5,
    });
  });

  it("rejects old offsets farther than 40px instead of preserving remote labels", () => {
    const candidate = { ...label("remote"), offset: { x: -60, y: -200 } };
    const rect = placeLabels([candidate], [], viewport).get(candidate.id)!;
    expect(rectCenter(rect)).toEqual({ x: 200, y: 272 });
  });
});

describe("native UI band", () => {
  it.each([[390, 844], [430, 932]])("reserves the top controls and the entire pill/dock band at %sx%s", (width, height) => {
    const { viewport } = nativeLabelLayout(width, height);
    expect(viewport).toEqual({ left: 20, top: 120, right: width - 20, bottom: height - 190 });
    expect(placeLabels([label("dock", 1, 120, height - 130)], [], viewport).size).toBe(0);
    expect(placeLabels([label("toolbar", 1, 120, 76)], [], viewport).size).toBe(0);
  });

  it("expands exclusions to match native safe areas and dock clearance", () => {
    expect(nativeLabelLayout(844, 390, 80, 59, 59, 160).viewport).toEqual({
      left: 59, top: 124, right: 785, bottom: 174,
    });
  });
});

describe("label zoom threshold", () => {
  it.each([300, 600])("hides labels above 0.85x the %sm opening distance and fades below it", opening => {
    expect(labelOpacity(opening, opening)).toBe(0);
    expect(labelOpacity(opening * 0.86, opening)).toBe(0);
    expect(labelOpacity(opening * 0.85, opening)).toBe(0);
    expect(labelOpacity(opening * 0.825, opening)).toBeCloseTo(0.5);
    expect(labelOpacity(opening * 0.8, opening)).toBeCloseTo(1);
    expect(labelOpacity(opening * 0.7, opening)).toBe(1);
    expect(labelOpacity(opening * 0.849, opening)).toBeLessThan(0.01);
  });
});
