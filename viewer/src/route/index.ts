import {
  AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { RouteCommand, RouteLoad } from "../bridge";
import { palette } from "../palette";
import type { ViewerScene } from "../scene";
import { layoutRoute } from "./layout";
import { RoutePlayback, type RoutePose } from "./playback";
import { createRouteWorld, type RouteWorld } from "./world";

export { createRouteWorld } from "./world";

export function createRouteScene(container: HTMLElement): ViewerScene<RouteLoad, RouteCommand> {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;

  const scene = new Scene();
  scene.background = new Color(palette.sky.horizon);
  scene.fog = new Fog(palette.sky.fog, 35, 110);
  const camera = new PerspectiveCamera(44, 1, 0.05, 250);
  const sun = new DirectionalLight(palette.light.sun, 2.6);
  sun.position.set(-12, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(new AmbientLight(palette.light.sky, 1.65), sun, new DirectionalLight(palette.light.ground, 0.75));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minDistance = 2.5;
  controls.maxDistance = 90;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.addEventListener("change", render);

  let world: RouteWorld | undefined;
  let playback: RoutePlayback | undefined;
  let cameraMode: "overview" | "follow" | "free" = "overview";
  let animationFrame: number | undefined;
  let previousFrameTime = 0;
  let pointerOrigin: { x: number; y: number; pointerId: number } | undefined;
  let gotoTransition: {
    elapsed: number;
    fromPosition: Vector3;
    fromTarget: Vector3;
    markerFrom: Vector3;
    pose: RoutePose;
  } | undefined;

  function render() {
    renderer.render(scene, camera);
  }

  function setMarkerPose(pose: RoutePose) {
    if (!world) return;
    world.marker.position.set(pose.position[0], pose.position[1] + 0.24, pose.position[2]);
  }

  function followPosition(pose: RoutePose) {
    const forward = new Vector3(-Math.sin(pose.heading), 0, -Math.cos(pose.heading));
    const target = new Vector3(pose.position[0], pose.position[1] + 0.9, pose.position[2]);
    const position = target.clone().addScaledVector(forward, -5.2);
    // Keep the camera near the walked floor during stairs and elevator travel.
    position.y += 2.65;
    return { position, target };
  }

  function startAnimation() {
    if (animationFrame === undefined) {
      previousFrameTime = performance.now();
      animationFrame = requestAnimationFrame(animate);
    }
  }

  function animate(now: number) {
    animationFrame = undefined;
    const delta = Math.min(Math.max((now - previousFrameTime) / 1000, 0), 0.1);
    previousFrameTime = now;
    playback?.update(delta);

    if (gotoTransition && world) {
      const transition = gotoTransition;
      transition.elapsed = Math.min(transition.elapsed + delta, 0.58);
      const t = transition.elapsed / 0.58;
      const eased = t * t * (3 - 2 * t);
      const destination = followPosition(transition.pose);
      if (cameraMode !== "free") {
        camera.position.copy(transition.fromPosition).lerp(destination.position, eased);
        controls.target.copy(transition.fromTarget).lerp(destination.target, eased);
      }
      world.marker.position.copy(transition.markerFrom).lerp(
        new Vector3(transition.pose.position[0], transition.pose.position[1] + 0.24, transition.pose.position[2]), eased,
      );
      if (t >= 1) gotoTransition = undefined;
    } else if (cameraMode === "follow" && playback && world) {
      const destination = followPosition(playback.pose);
      if (playback.isPlaying) {
        const blend = 1 - Math.exp(-9 * delta);
        camera.position.lerp(destination.position, blend);
        controls.target.lerp(destination.target, blend);
      } else {
        camera.position.copy(destination.position);
        controls.target.copy(destination.target);
      }
      setMarkerPose(playback.pose);
    }

    if (cameraMode === "follow") controls.update();
    render();
    if (playback?.isPlaying || gotoTransition) startAnimation();
  }

  function onPointerDown(event: PointerEvent) {
    if (event.isPrimary) pointerOrigin = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  }

  function onPointerMove(event: PointerEvent) {
    if (!pointerOrigin || pointerOrigin.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointerOrigin.x, event.clientY - pointerOrigin.y) >= 4) {
      cameraMode = "free";
    }
  }

  function onPointerEnd(event: PointerEvent) {
    if (pointerOrigin?.pointerId === event.pointerId) pointerOrigin = undefined;
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerEnd);
  renderer.domElement.addEventListener("pointercancel", onPointerEnd);

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  }

  function frameRoute(routeWorld: RouteWorld) {
    const positions: Vector3[] = [];
    routeWorld.root.traverse((object) => {
      if (object.name === "route-joint") positions.push(object.position.clone());
    });
    if (positions.length === 0) positions.push(new Vector3());
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const point of positions) {
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
    }
    const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 4);
    const distance = size * 1.55 + 4;
    controls.target.copy(center);
    camera.position.set(center.x + distance * 0.68, center.y + distance, center.z + distance * 0.82);
    camera.near = Math.max(0.05, distance / 500);
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    controls.update();
  }

  container.replaceChildren(renderer.domElement);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  return {
    load(message) {
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
      animationFrame = undefined;
      world?.dispose();
      world?.root.removeFromParent();
      world = createRouteWorld(message.route);
      scene.add(world.root);
      const layout = layoutRoute(message.route);
      playback = new RoutePlayback(message.route, layout, (stepIndex) => {
        const outgoing = { type: "route:stepChanged", stepIndex } as const;
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(outgoing));
        else console.log(outgoing);
      });
      cameraMode = "overview";
      gotoTransition = undefined;
      frameRoute(world);
      render();
    },
    handle(message) {
      if (!playback || !world) return;
      if (message.type === "route:goto") {
        const markerFrom = world.marker.position.clone();
        playback.goto(message.stepIndex);
        const pose = playback.pose;
        cameraMode = "follow";
        gotoTransition = {
          elapsed: 0,
          fromPosition: camera.position.clone(),
          fromTarget: controls.target.clone(),
          markerFrom,
          pose,
        };
        startAnimation();
      } else if (message.type === "route:play") {
        gotoTransition = undefined;
        if (message.playing) {
          cameraMode = "follow";
          playback.play(true);
          startAnimation();
        } else {
          playback.play(false);
        }
      }
    },
    dispose() {
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
      animationFrame = undefined;
      playback = undefined;
      gotoTransition = undefined;
      observer.disconnect();
      controls.removeEventListener("change", render);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerEnd);
      renderer.domElement.removeEventListener("pointercancel", onPointerEnd);
      world?.dispose();
      world?.root.removeFromParent();
      world = undefined;
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
