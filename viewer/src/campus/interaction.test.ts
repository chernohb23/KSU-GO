import { Group, PerspectiveCamera, Scene, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import campusJson from "../../../shared/fixtures/campus.json";
import type { Campus, Event } from "../../../shared/types";
import { installBridge, type OutgoingMessage } from "../bridge";
import { createCampusScene } from "./index";

const rendered = vi.hoisted(() => ({
  scene: undefined as Scene | undefined,
  camera: undefined as PerspectiveCamera | undefined,
  target: undefined as Vector3 | undefined,
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
      constructor(private camera: PerspectiveCamera) {
        rendered.target = this.target;
      }
      update() {
        this.camera.lookAt(this.target);
        this.camera.updateMatrixWorld(true);
        return false;
      }
      addEventListener() {}
      dispose() {}
    },
  };
});

const campus = campusJson as Campus;
const now = "2026-11-17T12:00:00Z";
const event: Event = {
  id: "event-1", title: "Test event", description: "", organizer: "", category: "other",
  startsAt: "2026-11-17T13:00:00Z", endsAt: "2026-11-17T14:00:00Z",
  location: { buildingId: campus.buildings[0].id, room: "101" },
  routeId: null, capacity: null, registeredCount: 0,
};

describe("campus scene tap and selection", () => {
  let scene: ReturnType<typeof createCampusScene>;
  let canvas: EventTarget;
  let flags: Group;
  let messages: OutgoingMessage[];
  let receive: (message: unknown) => void;
  let frames: Map<number, FrameRequestCallback>;
  let time: number;

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
      createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
    });
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    const container = {
      clientWidth: 390, clientHeight: 844,
      replaceChildren(child: EventTarget) { canvas = child; },
      append() {},
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
