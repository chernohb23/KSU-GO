import {
  ACESFilmicToneMapping, AmbientLight, Color, DirectionalLight, Fog, GridHelper,
  Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export interface ViewerScene<Load, Command> {
  load(message: Load): void;
  handle(message: Command): void;
  dispose(): void;
}

export function createPlaceholder<Load, Command>(
  container: HTMLElement,
  groundColor: number,
  cubeColor: number,
): ViewerScene<Load, Command> {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = ACESFilmicToneMapping;
  const scene = new Scene();
  scene.background = new Color(groundColor);
  scene.fog = new Fog(groundColor, 14, 27);
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(5.2, 3.8, 6.4);

  const light = new DirectionalLight(0xffe8c4, 3.1);
  light.position.set(-3.5, 6, 4);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.normalBias = 0.025;
  const fill = new DirectionalLight(0xbbdcff, 1.5);
  fill.position.set(4, 2, -5);
  scene.add(new AmbientLight(0xd5e6ff, 0.95), light, fill);

  const ground = new Mesh(
    new PlaneGeometry(60, 60),
    new MeshStandardMaterial({ color: groundColor }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  const grid = new GridHelper(32, 48, 0x73837f, 0x73837f);
  grid.position.y = 0.005;
  grid.material.transparent = true;
  grid.material.opacity = 0.18;

  const base = new Mesh(
    new RoundedBoxGeometry(3.25, 0.34, 3.25, 3, 0.13),
    new MeshStandardMaterial({ color: groundColor, roughness: 0.65 }),
  );
  base.rotation.y = -0.15;
  base.position.y = 0.17;
  base.castShadow = true;
  base.receiveShadow = true;
  const cube = new Mesh(
    new RoundedBoxGeometry(1.95, 1.95, 1.95, 5, 0.17),
    new MeshStandardMaterial({ color: cubeColor, roughness: 0.36, metalness: 0.18 }),
  );
  cube.position.y = 1.32;
  cube.rotation.y = 0.22;
  cube.castShadow = true;
  scene.add(ground, grid, base, cube);

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  }

  function render() {
    renderer.render(scene, camera);
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.85, 0);
  controls.enablePan = false;
  controls.minDistance = 4.8;
  controls.maxDistance = 14;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.update();
  controls.addEventListener("change", render);

  container.replaceChildren(renderer.domElement);
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  return {
    load: resize,
    handle() {
      // Placeholder scenes have no flags or route steps to move to.
    },
    dispose() {
      observer.disconnect();
      controls.dispose();
      light.shadow.dispose();
      for (const object of [ground, grid, base, cube]) {
        object.geometry.dispose();
        object.material.dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
