import { Box3, Group, PerspectiveCamera, Scene, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import campusJson from "../../../shared/fixtures/campus.json";
import type { Campus, Event } from "../../../shared/types";
import { installBridge, type OutgoingMessage } from "../bridge";
import { createCampusScene } from "./index";
import { browserLoad } from "../browser";
import { roofCenter } from "./roof";
import { nativeLabelLayout, overlaps, type Rect } from "./labelPlacement";

const rendered = vi.hoisted(() => ({
  scene: undefined as Scene | undefined,
  camera: undefined as PerspectiveCamera | undefined,
  target: undefined as Vector3 | undefined,
  facingErrors: [] as number[],
  maxDistance: 0,
}));

// Keep the real scene, flags and camera math; only replace WebGL and DOM controls.
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = Object.assign(new EventTarget(), {
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 390, height: 844 }),
        remove() {},
      });
      setPixelRatio() {}
      setSize() {}
      dispose() {}
      render(scene: Scene, camera: PerspectiveCamera) {
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        rendered.scene = scene;
        rendered.camera = camera;
        rendered.facingErrors = (scene.getObjectByName("flags")?.children ?? []).map(flag => {
          const cloth = flag.getObjectByName("flag-cloth")!;
          const normal = cloth.getWorldDirection(new actual.Vector3()).setY(0).normalize();
          const towardCamera = camera.position.clone().sub(cloth.getWorldPosition(new actual.Vector3())).setY(0).normalize();
          return normal.angleTo(towardCamera) * 180 / Math.PI;
        });
      }
    },
  };
});

vi.mock("three/addons/controls/MapControls.js", async () => {
  const { Vector3 } = await import("three");
  return {
    MapControls: class {
      target = new Vector3();
      cursor = new Vector3();
      lastPosition = new Vector3();
      maxDistance = Infinity;
      constructor(private camera: PerspectiveCamera) {
        rendered.target = this.target;
      }
      update() {
        this.camera.lookAt(this.target);
        this.camera.updateMatrixWorld(true);
        rendered.maxDistance = this.maxDistance;
        const moved = !this.lastPosition.equals(this.camera.position);
        this.lastPosition.copy(this.camera.position);
        return moved;
      }
      addEventListener() {}
      dispose() {}
    },
  };
});

const campus = campusJson as Campus;
const now = "2026-11-17T12:00:00Z";
const event: Event = {
  id: "event-1", title: "Test event", description: "", organizationId: "org-test", organizer: "",
  partnerOrganizationId: null, category: "other", tags: [],
  startsAt: "2026-11-17T13:00:00Z", endsAt: "2026-11-17T14:00:00Z",
  location: { buildingId: campus.buildings[0].id, room: "101" },
  routeId: null, capacity: null, registeredCount: 0, status: "active",
};

describe("campus scene tap and selection", () => {
  let scene: ReturnType<typeof createCampusScene>;
  let canvas: EventTarget;
  let flags: Group;
  let messages: OutgoingMessage[];
  let receive: (message: unknown) => void;
  let frames: Map<number, FrameRequestCallback>;
  let time: number;
  let overlays: HTMLElement[];

  function frame(at: number) {
    time = at;
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(time);
  }

  function marker(id = event.id) {
    return flags.getObjectByName(id)!.getObjectByName("flag-marker")!;
  }

  function screenPoint(id = event.id) {
    const projected = marker(id).getWorldPosition(new Vector3()).project(rendered.camera!);
    return { x: 10 + 390 * (projected.x + 1) / 2, y: 20 + 844 * (1 - projected.y) / 2 };
  }

  function pointer(type: string, x: number, y: number) {
    canvas.dispatchEvent(Object.assign(new globalThis.Event(type), {
      isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: y,
    }));
  }

  function tap(x: number, y: number) {
    pointer("pointerdown", x, y);
    pointer("pointerup", x, y);
  }

  beforeEach(() => {
    time = 0;
    overlays = [];
    frames = new Map();
    let nextFrame = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.stubGlobal("window", { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("document", {
      createElement: () => Object.assign(new EventTarget(), { style: {}, setAttribute() {}, append() {}, remove() {} }),
    });
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    const container = {
      clientWidth: 390, clientHeight: 844,
      replaceChildren(child: EventTarget) { canvas = child; },
      append(...elements: HTMLElement[]) { overlays.push(...elements); },
    } as unknown as HTMLElement;
    messages = [];
    const host = { ksugo: { receive: (_message: unknown) => {} } };
    const send = installBridge(host, (message) => {
      if (message.type === "campus:load") scene.load(message);
      if (message.type === "campus:select") scene.handle(message);
    }, (message) => messages.push(message));
    receive = host.ksugo.receive;
    scene = createCampusScene(container, (eventId) => send({ type: "campus:flagTapped", eventId }));
    receive({ type: "campus:load", campus, events: [event, { ...event, id: "event-2" }], now });
    frame(0);
    flags = rendered.scene!.getObjectByName("flags") as Group;
    messages.length = 0;
  });

  afterEach(() => {
    scene?.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a tap hitting a flag emits campus:flagTapped with that event's id", () => {
    const point = screenPoint("event-2");
    tap(point.x, point.y);
    expect(messages).toEqual([{ type: "campus:flagTapped", eventId: "event-2" }]);
  });

  it("a tap on empty ground emits nothing", () => {
    tap(15, 25);
    expect(messages).toEqual([]);
  });

  it("marks only saved event flags and clears the mark on a load without saved IDs", () => {
    const load = { type: "campus:load", campus, events: [event, { ...event, id: "event-2" }], now };
    receive({ ...load, savedEventIds: [event.id, "unknown"] });
    frame(20);
    const savedMark = (id: string) => flags.getObjectByName(id)?.getObjectByName("flag-saved");
    expect(savedMark(event.id)).toBeDefined();
    expect(savedMark("event-2")).toBeUndefined();
    expect(flags.getObjectByName("unknown")).toBeUndefined();
    const point = screenPoint();
    tap(point.x, point.y);
    expect(messages).toEqual([{ type: "campus:flagTapped", eventId: event.id }]);
    receive(load);
    frame(40);
    expect(savedMark(event.id)).toBeUndefined();
    expect(savedMark("event-2")).toBeUndefined();
  });

  it("adds non-interactive building labels and positions them on the map", () => {
    const labels = overlays.filter(element => campus.buildings.some(building => building.name === element.textContent));
    expect(labels.map(label => label.textContent)).toEqual(campus.buildings.map(building => building.name));
    expect(labels.every(label => label.style.opacity === "0")).toBe(true);
    const offset = rendered.camera!.position.clone().sub(rendered.target!);
    rendered.camera!.position.copy(rendered.target!).add(offset.multiplyScalar(0.8));
    frame(20);
    expect(labels.some(label => label.style.visibility === "visible" && label.style.left?.endsWith("px"))).toBe(true);
    expect(labels.every(label => label.style.pointerEvents === "none")).toBe(true);
    expect(labels.every(label => label.style.whiteSpace === "nowrap")).toBe(true);
    expect(labels.every(label => label.style.textOverflow === "ellipsis")).toBe(true);
  });

  it.each([[390, 844], [430, 932]])("anchors zoomed-in labels to their own roofs at %sx%s", (width, height) => {
    scene.dispose();
    window.ReactNativeWebView = { postMessage() {} };
    overlays = [];
    const container = {
      clientWidth: width, clientHeight: height,
      replaceChildren(child: EventTarget) { canvas = child; },
      append(...elements: HTMLElement[]) { overlays.push(...elements); },
    } as unknown as HTMLElement;
    scene = createCampusScene(container, () => {});
    const load = browserLoad("?scene=campus", new Date(now))!;
    if (load.type !== "campus:load") throw new Error("Expected campus fixture");
    scene.load({ ...load, savedEventIds: load.events.map(event => event.id) });
    frame(20);
    const labels = overlays.filter(element => campus.buildings.some(building => building.name === element.textContent));
    const projectRect = (object: Group) => {
      const box = new Box3().setFromObject(object);
      const points = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = new Vector3(x, y, z).project(rendered.camera!);
        points.push([(p.x + 1) * width / 2, (1 - p.y) * height / 2]);
      }
      return { left: Math.min(...points.map(p => p[0])), top: Math.min(...points.map(p => p[1])),
        right: Math.max(...points.map(p => p[0])), bottom: Math.max(...points.map(p => p[1])) };
    };
    expect(labels).toHaveLength(campus.buildings.length);
    expect(labels.every(label => label.style.opacity === "0")).toBe(true);
    const camera = rendered.camera!, target = rendered.target!;
    const offset = camera.position.clone().sub(target);
    const openingDistance = offset.length();
    const mathematics = campus.buildings.find(building => building.id === "b-mathematics")!;
    const [mx, mz] = roofCenter(mathematics.footprint);
    expect(target.toArray()).toEqual([mx / 2, 0, mz / 2]);
    const { viewport } = nativeLabelLayout(width, height);
    const projectedTarget = target.clone().project(camera);
    expect((1 - projectedTarget.y) * height / 2).toBeCloseTo((viewport.top + viewport.bottom) / 2);
    expect(rendered.maxDistance).toBeCloseTo(openingDistance / 0.75 * 2);
    // The full fit remains reachable and includes every building in the visible band.
    camera.position.copy(target).add(offset.clone().multiplyScalar(1 / 0.75));
    frame(30);
    for (const building of campus.buildings) {
      const rect = projectRect(rendered.scene!.getObjectByName(building.id)! as Group);
      expect(rect.left).toBeGreaterThanOrEqual(viewport.left - 0.001);
      expect(rect.right).toBeLessThanOrEqual(viewport.right + 0.001);
      expect(rect.top).toBeGreaterThanOrEqual(viewport.top - 0.001);
      expect(rect.bottom).toBeLessThanOrEqual(viewport.bottom + 0.001);
    }
    camera.position.copy(target).add(offset.clone().multiplyScalar(0.8));
    frame(40);
    const obstacles = rendered.scene!.getObjectByName("flags")!.children.map(flag => projectRect(flag as Group));
    const visible = labels.filter(label => label.style.visibility === "visible");
    expect(visible.length).toBeGreaterThan(0);
    const rects: Rect[] = visible.map(label => ({ left: Number.parseFloat(label.style.left), top: Number.parseFloat(label.style.top),
      right: Number.parseFloat(label.style.left) + Number.parseFloat(label.style.width), bottom: Number.parseFloat(label.style.top) + 20 }));
    rects.forEach((rect, index) => {
      expect(Number(visible[index].style.opacity)).toBeCloseTo(1);
      expect(rect.left).toBeGreaterThanOrEqual(viewport.left);
      expect(rect.right).toBeLessThanOrEqual(viewport.right);
      expect(rect.top).toBeGreaterThanOrEqual(viewport.top);
      expect(rect.bottom).toBeLessThanOrEqual(viewport.bottom);
      for (const obstacle of [...obstacles, ...rects.slice(index + 1)]) expect(overlaps(rect, obstacle)).toBe(false);
    });
    rects.forEach((rect, index) => {
      const building = campus.buildings.find(building => building.name === visible[index].textContent)!;
      const [x, z] = roofCenter(building.footprint);
      const anchor = new Vector3(x, building.heightM, z).project(camera);
      expect(Math.hypot((rect.left + rect.right) / 2 - (anchor.x + 1) * width / 2,
        (rect.top + rect.bottom) / 2 - (1 - anchor.y) * height / 2)).toBeLessThanOrEqual(40.001);
    });
    for (const [ratio, alpha] of [[0.825, 0.5], [0.86, 0], [0.825, 0.5], [0.8, 1]]) {
      camera.position.copy(target).add(offset.clone().multiplyScalar(ratio));
      frame(time + 20);
      const shown = labels.filter(label => label.style.visibility === "visible");
      if (alpha === 0) expect(shown).toHaveLength(0);
      else {
        expect(shown.length).toBeGreaterThan(0);
        for (const label of shown) expect(Number(label.style.opacity)).toBeCloseTo(alpha);
      }
    }
  });

  it("updates flag facing before drawing during orbit and focus animation", () => {
    const expectFacing = () => {
      expect(rendered.facingErrors.length).toBe(2);
      for (const angle of rendered.facingErrors) expect(angle).toBeLessThan(2);
    };
    expectFacing();
    rendered.camera!.position.set(-250, 200, 80);
    frame(16);
    expectFacing();
    receive({ type: "campus:select", eventId: event.id });
    frame(225);
    expectFacing();
    frame(466);
    expectFacing();
  });

  it("campus:select highlights its flag and eases the camera to its ground position", () => {
    const originalTarget = rendered.target!.clone();
    const originalCamera = rendered.camera!.position.clone();
    const destination = marker().getWorldPosition(new Vector3()).setY(0);

    receive({ type: "campus:select", eventId: event.id });
    expect(flags.getObjectByName(event.id)!.userData.selected).toBe(true);
    expect(flags.getObjectByName("event-2")!.userData.selected).toBe(false);
    expect(rendered.target!.toArray()).toEqual(originalTarget.toArray());
    frame(225);
    expect(marker().scale.x).toBe(1.5);
    expect(rendered.target!.distanceTo(originalTarget)).toBeGreaterThan(0);
    expect(rendered.target!.distanceTo(destination)).toBeGreaterThan(0);
    frame(450);
    expect(rendered.target!.distanceTo(destination)).toBeLessThan(1e-8);
    const translation = destination.clone().sub(originalTarget);
    expect(rendered.camera!.position.distanceTo(originalCamera.add(translation))).toBeLessThan(1e-8);
  });

  it("campus:select null clears the highlight and cancels an active focus", () => {
    receive({ type: "campus:select", eventId: event.id });
    frame(100);
    expect(marker().scale.x).toBe(1.5);
    const target = rendered.target!.clone();

    receive({ type: "campus:select", eventId: null });
    frame(450);
    expect(flags.children.every((flag) => flag.userData.selected === false)).toBe(true);
    expect(marker().scale.x).toBe(1);
    expect(rendered.target!.toArray()).toEqual(target.toArray());
  });

  it("dragging or cancelling over a flag does not emit a tap", () => {
    const point = screenPoint();
    pointer("pointerdown", point.x - 9, point.y);
    pointer("pointerup", point.x, point.y);
    pointer("pointerdown", point.x, point.y);
    pointer("pointercancel", point.x, point.y);
    pointer("pointerup", point.x, point.y);
    expect(messages).toEqual([]);
  });
});
