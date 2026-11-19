import {
  AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { RouteCommand, RouteLoad } from "../bridge";
import { palette } from "../palette";
import type { ViewerScene } from "../scene";
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

  function render() {
    renderer.render(scene, camera);
  }

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
      world?.dispose();
      world?.root.removeFromParent();
      world = createRouteWorld(message.route);
      scene.add(world.root);
      frameRoute(world);
      render();
    },
    handle(_message) {
      // Camera navigation is implemented by ROUTE-3.
    },
    dispose() {
      observer.disconnect();
      controls.removeEventListener("change", render);
      controls.dispose();
      world?.dispose();
      world?.root.removeFromParent();
      world = undefined;
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
