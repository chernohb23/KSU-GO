import { Group, Line, LineBasicMaterial, Mesh } from "three";
import { describe, expect, it, vi } from "vitest";
import fixture from "../../../shared/fixtures/campus.json";
import type { Campus, Event } from "../../../shared/types";
import { createFlags } from "./flags";
import { palette } from "../palette";

const now = Date.UTC(2026, 10, 17, 12);
const minutes = (offset: number) => new Date(now + offset * 60_000).toISOString();
const campus = fixture as Campus;
const [building] = campus.buildings;

function event(id: string, start: number, end: number, buildingId = building.id): Event {
  return {
    id, title: "Sample event", description: "", organizationId: "org-test", organizer: "",
    partnerOrganizationId: null, category: "academic", tags: [],
    startsAt: minutes(start), endsAt: minutes(end),
    location: { buildingId, room: "101" },
    routeId: null, capacity: null, registeredCount: 0,
  };
}

function pole(group: Group, id: string) {
  const object = group.getObjectByName(id)?.children[0];
  if (!(object instanceof Line) || !(object.material instanceof LineBasicMaterial)) {
    throw new Error("Missing event pole: " + id);
  }
  return object;
}

describe("campus event flags", () => {
  it.each([
    [-15, 15, palette.flags.live, 30],
    [0, 30, palette.flags.live, 30],
    [1, 31, palette.flags.soon, 29.925],
    [60, 90, palette.flags.soon, 25.5],
    [61, 91, palette.flags.later, 25.425],
    [240, 270, palette.flags.later, 12],
    [400, 430, palette.flags.later, 12],
  ])("draws the correct flag at %s minutes until start", (start, end, color, height) => {
    const group = new Group();
    const flags = createFlags(group, campus, [event("sample", start, end)], minutes(0));
    const stem = pole(group, "sample");
    const position = stem.geometry.getAttribute("position");
    const [x, z] = building.entrance;
    expect(position.getX(0)).toBeCloseTo(x);
    expect(position.getY(0)).toBe(0);
    expect(position.getZ(0)).toBeCloseTo(z);
    expect(position.getY(1)).toBeCloseTo(height);
    expect(stem.material.color.getHex()).toBe(color);
    flags.dispose();
  });

  it("fans out flags sharing an entrance and omits ended and unknown-building events", () => {
    const group = new Group();
    const flags = createFlags(group, campus, [
      event("first", 10, 50), event("second", 10, 50),
      event("ended", -25, 0), event("unknown", 10, 50, "missing"),
    ], minutes(0));
    const first = pole(group, "first").geometry.getAttribute("position");
    const second = pole(group, "second").geometry.getAttribute("position");
    expect(first.getX(0)).toBe(second.getX(0));
    expect(first.getX(1)).toBeLessThan(second.getX(1));
    expect(group.getObjectByName("ended")).toBeUndefined();
    expect(group.getObjectByName("unknown")).toBeUndefined();
    flags.dispose();
  });

  it("requests frames while live flags pulse and disposes before a static reload", () => {
    const group = new Group();
    const buildingObject = new Group();
    group.add(buildingObject);
    const flags = createFlags(group, campus, [event("live", -10, 30)], minutes(0));
    const marker = group.getObjectByName("live")?.getObjectByName("flag-marker") as Mesh;
    expect(flags.update(0)).toBe(true);
    expect(flags.update(0.24)).toBe(true);
    expect(marker.scale.x).toBeGreaterThan(1);

    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    pole(group, "live").geometry.addEventListener("dispose", geometryDisposed);
    pole(group, "live").material.addEventListener("dispose", materialDisposed);
    flags.dispose();
    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    expect(group.children).toEqual([buildingObject]);

    const next = createFlags(group, campus, [event("new", 60, 90)], minutes(0));
    expect(next.update(0.25)).toBe(false);
    expect(group.getObjectByName("new")).toBeDefined();
    next.dispose();
    expect(group.children).toEqual([buildingObject]);
  });
});
