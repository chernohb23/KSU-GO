// Campus map scene: renderer, camera, controls, OSM credit and the flags seam.
// The geometry itself is built by ./build.ts.

import { Box3, Color, Fog, MathUtils, PerspectiveCamera, Plane, Raycaster, Scene, Spherical, Vector2, Vector3, WebGLRenderer, type Object3D, type Mesh } from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import type { CampusCommand, CampusLoad } from "../bridge";
import { palette } from "../palette";
import type { ViewerScene } from "../scene";
import { createCampusWorld, type BuildingData, type CampusInfo } from "./build";
import { createFlags, faceFlagsToCamera } from "./flags";
import { roofCenter } from "./roof";
import { createRenderLoop } from "./renderLoop";
import { labelOpacity, nativeLabelLayout, placeLabels, type Rect, type LabelCandidate } from "./labelPlacement";

// Map "pitch": polar angle from straight down. Portrait looks a little more
// steeply down, so less near ground fills the bottom of a tall screen.
const TILT_LANDSCAPE = MathUtils.degToRad(55);
const TILT_PORTRAIT = MathUtils.degToRad(49);
const AZIMUTH = MathUtils.degToRad(112); // camera sits east-north-east of the target
const MIN_DISTANCE = 70;

export function createCampusScene(
  container: HTMLElement,
  onFlagTap: (eventId: string) => void,
): ViewerScene<CampusLoad, CampusCommand> {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene();
  const fogColor = new Color(palette.sky.fog);
  scene.background = fogColor;
  const fog = new Fog(fogColor, 300, 900);
  scene.fog = fog;
  const camera = new PerspectiveCamera(42, 1, 4, 4000);

  const world = createCampusWorld();
  scene.add(world.root);

  // One finger pans, two fingers pinch to zoom and drag to rotate (MapControls
  // defaults). Mouse: left pans, right rotates, wheel zooms.
  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.screenSpacePanning = false; // pan along the ground, so the target stays at y = 0
  controls.minDistance = MIN_DISTANCE;
  controls.enabled = false; // until the first campus:load

  container.replaceChildren(renderer.domElement);
  const credit = document.createElement("div");
  credit.setAttribute("role", "note");
  Object.assign(credit.style, {
    position: "absolute",
    right: "20px",
    bottom: "12px",
    padding: "1px 6px",
    borderRadius: "4px",
    background: css(palette.ui.surface, 0.75),
    color: css(palette.ui.text),
    font: "10px/1.5 -apple-system, system-ui, sans-serif",
    pointerEvents: "none",
    userSelect: "none",
    display: "none",
  });
  container.append(credit);
  const legend = createFlagLegend();
  container.append(legend);
  const labels: { id: string; element: HTMLElement; building: Mesh; anchor: Vector3 }[] = [];
  const labelOffsets = new Map<string, { x: number; y: number }>();

  // ---- render on demand: frames run only while something moves --------------
  let openingDistance = Infinity;
  let userMoved = false;
  let info: CampusInfo | undefined;
  let selectedId: string | null = null;
  let focus: { from: Vector3; to: Vector3; started: number; duration: number } | undefined;
  const lastTarget = new Vector3();

  function updateCamera() {
    if (!focus) return controls.update();
    const progress = focus.duration === 0 ? 1 : Math.min((performance.now() - focus.started) / focus.duration, 1);
    lastTarget.copy(controls.target);
    controls.target.lerpVectors(focus.from, focus.to, 1 - (1 - progress) ** 3);
    camera.position.add(controls.target).sub(lastTarget);
    controls.update();
    if (progress === 1) focus = undefined;
    return true;
  }

  function screenRect(object: Object3D, width: number, height: number): Rect | undefined {
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const rect = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    let visible = false;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      projected.set(x, y, z).project(camera);
      if (Math.abs(projected.z) > 1) continue;
      visible = true;
      const sx = (projected.x + 1) * width / 2, sy = (1 - projected.y) * height / 2;
      rect.left = Math.min(rect.left, sx); rect.right = Math.max(rect.right, sx);
      rect.top = Math.min(rect.top, sy); rect.bottom = Math.max(rect.bottom, sy);
    }
    return visible ? rect : undefined;
  }

  function nativeViewport(width: number, height: number) {
    const style = window.ReactNativeWebView ? window.getComputedStyle?.(document.documentElement) : undefined;
    const value = (name: string, fallback: number) => {
      const parsed = Number.parseFloat(style?.getPropertyValue(`--map-control-${name}`) ?? "");
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    return nativeLabelLayout(width, height, value("top", 76), value("left", 20), value("right", 20), value("clearance", 130));
  }

  function render() {
    const d = camera.position.distanceTo(controls.target);
    fog.near = d * 1.1;
    fog.far = d * 2.5;
    faceFlagsToCamera(world.flagsLayer, camera.position);
    renderer.render(scene, camera);
    const width = container.clientWidth, height = container.clientHeight;
    const obstacles: Rect[] = [];
    const candidates: LabelCandidate[] = [];
    const opacity = labelOpacity(d, openingDistance);
    for (const { id, element, anchor } of labels) {
      projected.copy(anchor).project(camera);
      if (Math.abs(projected.z) > 1) continue;
      const active = world.flagsLayer.children.some(flag => flag.userData.buildingId === id);
      const selected = world.flagsLayer.children.some(flag => flag.userData.buildingId === id && flag.userData.selected);
      candidates.push({ id, anchor: { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 },
        width: Math.min(200, width - 40, 16 + (element.textContent?.length ?? 0) * 5.8),
        height: 20, priority: selected ? 1000 : id === 'b-mathematics' ? 100 : active ? 20 : 1,
        offset: labelOffsets.get(id) });
    }
    for (const flag of world.flagsLayer.children) {
      const rect = screenRect(flag, width, height);
      if (rect) obstacles.push(rect);
    }
    const native = !!window.ReactNativeWebView;
    const nativeLayout = nativeViewport(width, height);
    // The app owns its toolbar and credit. Browser mode has its own collapsible legend.
    if (!native) obstacles.push({ left: width - (legend.open ? 216 : 64), top: 12, right: width - 16, bottom: legend.open ? 180 : 60 });
    const placements = placeLabels(opacity > 0 ? candidates : [], obstacles, native ? nativeLayout.viewport : {
      left: 20, top: 16, right: width - 20, bottom: height - 40,
    });
    for (const candidate of candidates) {
      const rect = placements.get(candidate.id);
      if (rect) labelOffsets.set(candidate.id, {
        x: rect.left - candidate.anchor.x,
        y: rect.top - candidate.anchor.y,
      });
    }
    for (const { id, element } of labels) {
      const rect = placements.get(id);
      element.style.opacity = String(rect ? opacity : 0);
      // Invalid slots disappear immediately so a fading label can never cover a flag.
      // Zoom itself fades continuously to zero before placements are removed.
      element.style.visibility = rect ? "visible" : "hidden";
      if (rect) {
        element.style.width = String(rect.right - rect.left) + 'px';
        element.style.left = String(rect.left) + 'px';
        element.style.top = String(rect.top) + 'px';
      }
    }
  }

  const loop = createRenderLoop(
    { request: (callback) => requestAnimationFrame(callback), cancel: (id) => cancelAnimationFrame(id) },
    { updateCamera, render },
  );
  const requestRender = loop.requestRender;
  legend.addEventListener("toggle", requestRender);

  controls.addEventListener("start", () => {
    focus = undefined;
    userMoved = true;
    requestRender();
  });
  controls.addEventListener("change", requestRender);

  // ---- default view: frame the Globe plaza and the buildings around it --------
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const raycaster = new Raycaster();
  const spherical = new Spherical();
  const projected = new Vector3();
  let pointer: { id: number; x: number; y: number } | undefined;

  function startTap(event: PointerEvent) {
    pointer = event.isPrimary && event.button === 0
      ? { id: event.pointerId, x: event.clientX, y: event.clientY }
      : undefined;
  }

  function finishTap(event: PointerEvent) {
    const start = pointer;
    pointer = undefined;
    if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;

    const rect = renderer.domElement.getBoundingClientRect();
    let closest = 30;
    let eventId: string | undefined;
    for (const flag of world.flagsLayer.children) {
      const marker = flag.getObjectByName("flag-marker");
      if (!marker) continue;
      marker.getWorldPosition(projected).project(camera);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1) continue;
      const x = rect.left + rect.width * (projected.x + 1) / 2;
      const y = rect.top + rect.height * (1 - projected.y) / 2;
      const distance = Math.hypot(x - event.clientX, y - event.clientY);
      if (distance < closest) {
        closest = distance;
        eventId = flag.name;
      }
    }
    if (eventId) onFlagTap(eventId);
  }

  function cancelTap() {
    pointer = undefined;
  }

  renderer.domElement.addEventListener("pointerdown", startTap);
  renderer.domElement.addEventListener("pointerup", finishTap);
  renderer.domElement.addEventListener("pointercancel", cancelTap);

  function selectFlag(eventId: string | null) {
    focus = undefined;
    const selected = world.flagsLayer.children.find(flag => flag.name === eventId);
    selectedId = selected?.name ?? null;
    for (const flag of world.flagsLayer.children) flag.userData.selected = flag === selected;
    return selected;
  }

  function placeCamera(target: Vector3, distance: number, tilt: number) {
    spherical.set(distance, tilt, AZIMUTH);
    camera.position.setFromSpherical(spherical).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function extent(points: Vector3[]) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const point of points) {
      projected.copy(point).project(camera);
      minX = Math.min(minX, projected.x); maxX = Math.max(maxX, projected.x);
      minY = Math.min(minY, projected.y); maxY = Math.max(maxY, projected.y);
    }
    return { minX, maxX, minY, maxY };
  }

  /** Moves `target` to the ground point under screen position (x, y) in NDC. */
  function retarget(target: Vector3, distance: number, tilt: number, x: number, y: number) {
    raycaster.setFromCamera(new Vector2(x, y), camera);
    const hit = new Vector3();
    if (raycaster.ray.intersectPlane(ground, hit)) target.copy(hit);
    placeCamera(target, distance, tilt);
  }

  /**
   * Fit the campus to the usable viewport. Native opens closer around the
   * Globe and Mathematics; the full fit remains reachable by zooming out.
   */
  function fitView(campusInfo: CampusInfo, tilt: number) {
    // Flags are not part of the fit: one far flag would pull the camera back to the forest.
    const points = campusInfo.focusPoints.map(([x, y, z]) => new Vector3(x, y, z));
    for (const { building } of labels) {
      const box = new Box3().setFromObject(building);
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        points.push(new Vector3(x, y, z));
      }
    }
    const target = new Vector3();
    points.forEach((p) => target.add(p));
    target.divideScalar(points.length).setY(0);
    const native = !!window.ReactNativeWebView;
    const width = Math.max(container.clientWidth, 1), height = Math.max(container.clientHeight, 1);
    const { viewport } = nativeViewport(width, height);
    const mathematics = labels.find(label => label.id === "b-mathematics");
    if (native) target.copy(mathematics?.anchor ?? new Vector3()).multiplyScalar(0.5).setY(0);
    const marginX = 0.88, marginY = 0.84;
    const fits = (e: ReturnType<typeof extent>) =>
      native
        ? e.minX >= 2 * viewport.left / width - 1 && e.maxX <= 2 * viewport.right / width - 1
          && e.minY >= 1 - 2 * viewport.bottom / height && e.maxY <= 1 - 2 * viewport.top / height
        : e.minX >= -marginX && e.maxX <= marginX && e.minY >= -marginY - 0.01 && e.maxY <= marginY;
    let distance = 300;
    for (let iteration = 0; iteration < (native ? 1 : 5); iteration++) {
      let lo = 40, hi = 2000;
      for (let k = 0; k < 30; k++) {
        distance = (lo + hi) / 2;
        placeCamera(target, distance, tilt);
        if (fits(extent(points))) hi = distance;
        else lo = distance;
      }
      distance = hi;
      placeCamera(target, distance, tilt);
      if (native) break;
      const e = extent(points);
      retarget(target, distance, tilt, (e.minX + e.maxX) / 2, (e.minY + e.maxY) / 2);
    }

    controls.maxDistance = Math.max(distance * 2, 380);
    openingDistance = Math.max(MIN_DISTANCE, distance * (native ? 0.75 : 1));
    placeCamera(target, openingDistance, tilt);
    controls.target.copy(target);
    controls.update();
  }

  function setTiltLimits(tilt: number) {
    // Narrow pitch range, always above the horizon: with the target on the
    // ground and a minimum distance, the camera can never go under the ground.
    controls.minPolarAngle = tilt - MathUtils.degToRad(7);
    controls.maxPolarAngle = tilt + MathUtils.degToRad(5);
  }

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const portrait = width < height;
    camera.aspect = width / height;
    camera.fov = portrait ? 45 : 36;
    if (window.ReactNativeWebView) {
      const { viewport } = nativeViewport(width, height);
      // Put the orbit target at the center of the unobscured band.
      camera.setViewOffset(width, height, 0, (height - viewport.bottom - viewport.top) / 2, width, height);
    } else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (info && !userMoved) {
      labelOffsets.clear();
      const tilt = portrait ? TILT_PORTRAIT : TILT_LANDSCAPE;
      setTiltLimits(tilt);
      fitView(info, tilt);
    }
    requestRender();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);

  return {
    load(message) {
      const first = !world.built;
      const built = world.load(message.campus); // builds buildings on the first load only

      loop.replaceFlags(() => createFlags(
        world.flagsLayer, message.campus, message.events, message.now, message.savedEventIds,
      ));
      selectFlag(selectedId);

      if (first) {
        for (const [id, building] of built.buildings) {
          const { name } = building.userData as BuildingData;
          const element = document.createElement("span");
          element.textContent = name;
          Object.assign(element.style, {
            position: "absolute",
            transition: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : "opacity 180ms ease",
            boxSizing: "border-box",
            height: "20px",
            maxWidth: "200px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            padding: "2px 5px",
            borderRadius: "4px",
            background: css(palette.ui.surface, 0.9),
            color: css(palette.ui.text),
            font: "600 10px/1.2 system-ui, sans-serif",
            textAlign: "center",
            pointerEvents: "none",
            userSelect: "none",
          });
          element.style.opacity = "0";
          element.style.visibility = "hidden";
          const source = message.campus.buildings.find(candidate => candidate.id === id)!;
          const [x, z] = roofCenter(source.footprint);
          labels.push({ id, element, building, anchor: new Vector3(x, source.heightM, z) });
          container.append(element);
        }
        legend.hidden = !!window.ReactNativeWebView;
        info = built.info;
        const { bounds, center } = info;
        controls.cursor.set(center[0], 0, center[1]);
        controls.maxTargetRadius = 0.36 * Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
        controls.enabled = true;
        credit.textContent = info.attribution ?? "";
        credit.style.display = info.attribution && !window.ReactNativeWebView ? "block" : "none";
        resize();
      }
      requestRender();
    },
    handle({ eventId }) {
      const marker = selectFlag(eventId)?.getObjectByName("flag-marker");
      if (marker) {
        userMoved = true;
        focus = {
          from: controls.target.clone(),
          to: marker.getWorldPosition(new Vector3()).setY(0),
          started: performance.now(),
          duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450,
        };
      }
      requestRender();
    },
    dispose() {
      loop.dispose(); // cancels the frame and disposes the flags handle
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", startTap);
      renderer.domElement.removeEventListener("pointerup", finishTap);
      renderer.domElement.removeEventListener("pointercancel", cancelTap);
      world.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      credit.remove();
      legend.removeEventListener("toggle", requestRender);
      legend.remove();
      for (const { element } of labels) element.remove();
    },
  };
}

function createFlagLegend(): HTMLDetailsElement {
  const legend = document.createElement("details");
  legend.setAttribute("role", "note");
  legend.hidden = true;
  Object.assign(legend.style, {
    position: "absolute",
    top: "16px",
    right: "20px",
    zIndex: "1",
    padding: "5px 8px",
    borderRadius: "6px",
    background: css(palette.ui.surface, 0.92),
    color: css(palette.ui.text),
    font: "11px/1.5 system-ui, sans-serif",
    pointerEvents: "auto",
    userSelect: "none",
  });

  const summary = document.createElement("summary");
  summary.textContent = "ⓘ";
  summary.setAttribute("aria-label", "Map legend");
  Object.assign(summary.style, { cursor: "pointer", font: "22px/32px system-ui", minWidth: "32px", textAlign: "center", listStyle: "none" });
  legend.append(summary);
  const key = document.createElement("div");
  Object.assign(key.style, { display: "flex", gap: "8px" });
  for (const [state, label] of [["live", "Live"], ["soon", "Within 1 hr"], ["later", "Later"]] as const) {
    const item = document.createElement("span");
    const dot = document.createElement("span");
    Object.assign(dot.style, {
      display: "inline-block",
      width: "7px",
      height: "7px",
      marginRight: "3px",
      borderRadius: "50%",
      background: css(palette.flags[state]),
    });
    const text = document.createElement("span");
    text.textContent = label;
    item.append(dot, text);
    key.append(item);
  }
  const height = document.createElement("div");
  height.textContent = "Taller flags start sooner";
  const saved = document.createElement("div");
  saved.textContent = "★ Saved event";
  legend.append(key, height, saved);
  return legend;
}

function css(hex: number, alpha = 1): string {
  return `rgb(${(hex >> 16) & 255} ${(hex >> 8) & 255} ${hex & 255} / ${alpha})`;
}
