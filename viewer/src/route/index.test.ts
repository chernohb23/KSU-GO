import { describe, expect, it, vi } from "vitest";
import { BufferGeometry, Material, Mesh } from "three";
import flawedJson from "../../../shared/fixtures/route.draft-flawed.json";
import sampleJson from "../../../shared/fixtures/route.sample.json";
import type { Route, Step } from "../../../shared/types";
import { layoutRoute } from "./layout";
import { createRouteWorld } from "./world";

const sample = sampleJson as Route;

describe("createRouteWorld", () => {
  it("builds the sample floors, both door frames, stair flights, and exact route centerline", () => {
    const world = createRouteWorld(sample);
    const named = (name: string) => world.root.getObjectByName(name);
    const layout = layoutRoute(sample);

    expect(named("floor-1")).toBeDefined();
    expect(named("floor-2")).toBeDefined();
    expect(world.root.getObjectsByProperty("name", "door-frame")).toHaveLength(2);
    expect(world.root.getObjectsByProperty("name", "stair-step")).toHaveLength(18);
    expect(named("entrance-marker")).toBeDefined();
    expect(named("destination-marker")).toBeDefined();
    const destinationSigns: string[] = [];
    world.root.traverse(object => { if (object.userData.text === sample.destination) destinationSigns.push(object.uuid); });
    expect(destinationSigns).toHaveLength(1);

    const routePoints = world.root.getObjectsByProperty("name", "route-line");
    expect(routePoints.length).toBe(layout.centerline.length - 1);
    routePoints.forEach((line, index) => {
      expect(line.userData.start).toEqual(layout.centerline[index]);
      expect(line.userData.end).toEqual(layout.centerline[index + 1]);
    });
    world.dispose();
  });

  it("draws an elevator shaft and starts the next floor corridor at that shaft", () => {
    const route: Route = {
      ...sample,
      startFloor: "1",
      destinationFloor: "3",
      steps: [
        { ...sample.steps[0], id: "start" },
        { ...sample.steps[1], id: "approach", type: "walk", lengthM: 4 } as Step,
        { ...sample.steps[2], id: "lift", type: "elevator", toFloor: "3" } as Step,
        { ...sample.steps[3], id: "exit", type: "walk", lengthM: 5 } as Step,
        { ...sample.steps.at(-1)!, id: "end" },
      ],
    };
    const world = createRouteWorld(route);

    expect(world.root.getObjectByName("elevator-shaft")).toBeDefined();
    expect(world.root.getObjectByName("elevator-label")?.userData.text).toBe("Elevator to floor 3");
    const upperFloor = world.root.getObjectByName("floor-3");
    expect(upperFloor?.userData.startPoint).toEqual([0, 7.2, -4]);
    const corridor = upperFloor?.children.find((object) => object.name === "corridor-floor");
    if (!(corridor instanceof Mesh)) throw new Error("Upper corridor floor was not built");
    corridor.geometry.computeBoundingBox();
    expect(corridor.geometry.boundingBox?.max.z).toBeCloseTo(-4);
    world.dispose();
  });

  it("renders the flawed draft fixture without errors", () => {
    expect(() => createRouteWorld(flawedJson as Route).dispose()).not.toThrow();
  });

  it("disposes every old geometry and material when a route world is rebuilt", () => {
    for (let cycle = 0; cycle < 10; cycle++) {
      const world = createRouteWorld(sample);
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      world.root.traverse((object) => {
        if (object instanceof Mesh) {
          geometries.add(object.geometry);
          vi.spyOn(object.geometry, "dispose");
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material);
            vi.spyOn(material, "dispose");
          }
        }
      });

      world.dispose();

      for (const geometry of geometries) expect(vi.mocked(geometry.dispose)).toHaveBeenCalledOnce();
      for (const material of materials) expect(vi.mocked(material.dispose)).toHaveBeenCalledOnce();
      expect(world.root.children).toHaveLength(0);
      expect(() => world.dispose()).not.toThrow();
    }
  });
});
