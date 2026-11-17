import { THREE_SOURCE } from './three-source';

const corridorScene = String.raw`
const scene = new Scene();
scene.background = new Color(0x101820);

const camera = new PerspectiveCamera(55, 1, 0.1, 100);
const renderer = new WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = SRGBColorSpace;

scene.add(new HemisphereLight(0xddeeff, 0x42505d, 2.2));
const sun = new DirectionalLight(0xffffff, 2.4);
sun.position.set(-3, 8, 6);
scene.add(sun);

const concrete = new MeshStandardMaterial({ color: 0xc7cdd1, roughness: 0.95 });
const floorMat = new MeshStandardMaterial({ color: 0x727d83, roughness: 1 });
const trim = new MeshStandardMaterial({ color: 0xe5a84b, roughness: 0.8 });

function box(width, height, depth, x, y, z, material = concrete) {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

// Entry corridor, one right turn, and an ascending stair flight.
box(3.2, 0.18, 9, 0, -0.09, -4.5, floorMat);
box(0.18, 3, 9, -1.65, 1.5, -4.5);
box(0.18, 3, 6.2, 1.65, 1.5, -1.4);
box(0.18, 3, 3.8, 1.65, 1.5, -6.9);
box(3.2, 0.18, 3, 0, -0.09, -9, floorMat);
box(6.2, 0.18, 3, 4.6, -0.09, -9, floorMat);
box(6.2, 3, 0.18, 4.6, 1.5, -10.65);
box(0.18, 3, 3, 7.7, 1.5, -9, concrete);

for (let index = 0; index < 8; index += 1) {
  const rise = 0.2 * (index + 1);
  const step = box(0.38, rise, 0.9, 2.6 + index * 0.38, rise / 2, -9, floorMat);
  step.userData.stepIndex = 1;
}
box(0.12, 1.6, 0.08, 7.3, 0.8, -10.45, trim);

let target = new Vector3(0, 1.2, -5.2);
let theta = 0.42;
let phi = 1.05;
let radius = 15;
function placeCamera() {
  const sinPhi = Math.sin(phi);
  camera.position.set(
    target.x + radius * sinPhi * Math.sin(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * sinPhi * Math.cos(theta),
  );
  camera.lookAt(target);
}
placeCamera();

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const fpsLabel = document.getElementById('fps');
let frameCount = 0;
let fpsStart = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  frameCount += 1;
  if (now - fpsStart >= 1000) {
    fpsLabel.textContent = Math.round(frameCount * 1000 / (now - fpsStart)) + ' FPS';
    frameCount = 0;
    fpsStart = now;
  }
}
requestAnimationFrame(animate);

const send = (message) => {
  const nativeBridge = window.ReactNativeWebView;
  if (nativeBridge && typeof nativeBridge.postMessage === 'function') {
    nativeBridge.postMessage(JSON.stringify(message));
  } else {
    console.log('Viewer message:', message);
  }
};
window.ksugo = {
  receive(message) {
    try {
      if (message?.type === 'route:goto' && Number.isInteger(message.stepIndex)) {
        if (message.stepIndex === 0) {
          target.set(0, 1.2, -5.2);
          theta = 0.42;
          phi = 1.05;
          radius = 15;
        } else {
          target.set(4.8, 1.5, -9);
          theta = 1.45;
          phi = 1.02;
          radius = 8;
        }
        placeCamera();
        send({ type: 'route:stepChanged', stepIndex: message.stepIndex });
      }
    } catch (error) {
      send({ type: 'error', message: String(error) });
    }
  },
};
send({ type: 'ready' });

let pointerDown = null;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!pointerDown) return;
  const dx = event.clientX - pointerDown.lastX;
  const dy = event.clientY - pointerDown.lastY;
  theta -= dx * 0.008;
  phi = Math.max(0.2, Math.min(1.5, phi + dy * 0.008));
  pointerDown.lastX = event.clientX;
  pointerDown.lastY = event.clientY;
  placeCamera();
});
canvas.addEventListener('pointerup', (event) => {
  if (pointerDown) {
    const movement = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    if (movement < 8) send({ type: 'route:stepChanged', stepIndex: 0 });
  }
  pointerDown = null;
});
canvas.addEventListener('pointercancel', () => { pointerDown = null; });
`;

export const corridorHtml = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#101820"><style>
html,body,#scene{width:100%;height:100%;margin:0;overflow:hidden;background:#101820}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;touch-action:none}#fps{position:fixed;top:10px;left:10px;padding:5px 8px;border-radius:5px;background:#101820cc;color:#fff;font-size:12px;z-index:2;pointer-events:none}
</style></head><body><div id="fps">Starting…</div><canvas id="scene"></canvas>
<script type="module">${THREE_SOURCE}
${corridorScene}
</script></body></html>`;
