import { Box3, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import fixture from "../../../shared/fixtures/campus.json";
import type { Campus, Event } from "../../../shared/types";
import { createFlags, faceFlagsToCamera } from "./flags";
import { palette } from "../palette";
import { pointInRing, distToRing } from "./geometry";
import { ROOF_DECK_OFFSET_M, roofCenter } from "./roof";

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
    routeId: null, capacity: null, registeredCount: 0, status: "active",
  };
}

function pole(group: Group, id: string) {
  const object = group.getObjectByName(id)?.getObjectByName("flag-pole");
  if (!(object instanceof Mesh) || !(object.geometry instanceof CylinderGeometry)) {
    throw new Error("Missing event pole: " + id);
  }
  return object;
}

describe("campus event flags", () => {
  it.each([[160, 90, -120], [-150, 200, 60], [0, 50, 200], [0, 300, -200]])(
    "faces cloth and saved stars toward camera offset %s,%s,%s within two degrees", (x, y, z) => {
      const group = new Group();
      group.rotation.y = 0.3;
      const flags = createFlags(group, campus, [event("saved", -10, 30)], minutes(0), ["saved"]);
      const flag = group.getObjectByName("saved")!;
      const cloth = flag.getObjectByName("flag-cloth")!;
      const star = flag.getObjectByName("flag-saved")!;
      const pivot = cloth.getWorldPosition(new Vector3());
      const camera = pivot.clone().add(new Vector3(x, y, z));
      faceFlagsToCamera(group, camera);
      flags.update(0.2);
      const towardCamera = camera.clone().sub(pivot).setY(0).normalize();
      for (const object of [cloth, star]) {
        const normal = object.getWorldDirection(new Vector3()).setY(0).normalize();
        expect(normal.angleTo(towardCamera) * 180 / Math.PI).toBeLessThan(2);
      }
      expect(cloth.rotation.x).toBe(0);
      expect(cloth.rotation.z).toBe(0);
      expect(cloth.getWorldPosition(new Vector3()).distanceTo(pivot)).toBeLessThan(1e-8);
      expect(pole(group, "saved").rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
      expect(star.parent).toBe(cloth);
      flags.dispose();
    },
  );
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
    const [x, z] = roofCenter(building.footprint);
    const roof = building.heightM + ROOF_DECK_OFFSET_M;
    group.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(stem);
    expect(stem.getWorldPosition(new Vector3()).toArray()).toEqual([x, roof + height / 2, z]);
    expect(bounds.min.y).toBeCloseTo(roof);
    expect(bounds.max.y).toBeCloseTo(roof + height);
    expect(pointInRing(x, z, building.footprint)).toBe(true);
    const marker = group.getObjectByName("sample")!.getObjectByName("flag-marker") as Mesh;
    expect((marker.material as MeshBasicMaterial).color.getHex()).toBe(color);
    expect(marker.geometry.index?.count ?? marker.geometry.getAttribute("position").count).toBe(
      start <= 0 ? 48 : start <= 60 ? 6 : 3,
    );
    expect(group.getObjectByName("flag-base")).toBeInstanceOf(Mesh);
    flags.dispose();
  });

  it("clusters flags on their roof and omits cancelled, ended and unknown-building events", () => {
    const group = new Group();
    const flags = createFlags(group, campus, [
      event("first", 10, 50), event("second", 10, 50),
      event("ended", -25, 0), event("unknown", 10, 50, "missing"), { ...event("cancelled", 10, 50), status: "cancelled" },
    ], minutes(0));
    const first = pole(group, "first");
    const second = pole(group, "second");
    const firstPosition = first.getWorldPosition(new Vector3());
    const secondPosition = second.getWorldPosition(new Vector3());
    expect([firstPosition.x, firstPosition.z]).toEqual(roofCenter(building.footprint));
    expect(firstPosition.distanceTo(secondPosition)).toBeGreaterThan(0);
    expect(firstPosition.distanceTo(secondPosition)).toBeLessThanOrEqual(18);
    for (const point of [firstPosition, secondPosition]) {
      expect(pointInRing(point.x, point.z, building.footprint)).toBe(true);
      expect(distToRing(point.x, point.z, building.footprint)).toBeGreaterThan(2.6);
    }
    for (const stem of [first, second]) expect(stem.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(group.getObjectByName("ended")).toBeUndefined();
    expect(group.getObjectByName("unknown")).toBeUndefined();
    expect(group.getObjectByName("cancelled")).toBeUndefined();
    flags.dispose();
  });

  it("requests frames while live flags pulse and disposes before a static reload", () => {
    const group = new Group();
    const buildingObject = new Group();
    group.add(buildingObject);
    const flags = createFlags(group, campus, [event("live", -10, 30)], minutes(0));
    const marker = group.getObjectByName("live")?.getObjectByName("flag-marker") as Mesh;
    const ring = group.getObjectByName("flag-pulse") as Mesh;
    expect(flags.update(0)).toBe(true);
    const before = Array.from(marker.geometry.getAttribute("position").array);
    const ringScale = ring.scale.x;
    expect(flags.update(0.24)).toBe(true);
    expect(Array.from(marker.geometry.getAttribute("position").array)).not.toEqual(before);
    const positions = marker.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getZ(i)).toBeGreaterThanOrEqual(marker.geometry.boundingBox!.min.z);
      expect(positions.getZ(i)).toBeLessThanOrEqual(marker.geometry.boundingBox!.max.z);
    }
    expect(ring.scale.x).not.toBe(ringScale);

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
