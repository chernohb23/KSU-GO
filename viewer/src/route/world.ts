import {
  BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Path, Shape, ShapeGeometry, SphereGeometry, Sprite, SpriteMaterial,
  Vector3,
} from "three";
import type { Route } from "../../../shared/types";
import { palette } from "../palette";
import { layoutRoute, type Polygon, type Vec3 } from "./layout";

const WALL_HEIGHT = 0.85;
const WALL_DEPTH = 0.12;
const ROUTE_RADIUS = 0.075;

export type RouteWorld = { root: Group; dispose(): void };

/** Creates all route geometry from the shared, coordinate-free route layout. */
export function createRouteWorld(route: Route): RouteWorld {
  const layout = layoutRoute(route);
  const root = new Group();
  root.name = "route-world";

  for (const floor of layout.floors) {
    const floorGroup = new Group();
    floorGroup.name = `floor-${floor.name}`;
    const firstWalk = layout.steps.find((step, index) => route.steps[index]?.type === "walk" && step.floorStart === floor.index);
    const reachedFloor = layout.steps.find((step) => step.floorEnd === floor.index);
    const startPoint = firstWalk?.start ?? reachedFloor?.end ?? [0, floor.y, 0];
    floorGroup.userData.startPoint = startPoint;
    root.add(floorGroup);

    const layers = [{ y: floor.y, footprint: floor.footprint }, ...floor.landings];
    for (const layer of layers) {
      for (const polygon of layer.footprint) {
        addSlab(floorGroup, polygon, layer.y, route.ceilingHeightM);
        addWalls(floorGroup, polygon, layer.y);
      }
    }

    const labelLayer = floor.footprint[0]
      ? { y: floor.y, polygon: floor.footprint[0] }
      : floor.landings[0] ? { y: floor.landings[0].y, polygon: floor.landings[0].footprint[0] } : undefined;
    const centroid = polygonCentroid(labelLayer?.polygon);
    floorGroup.add(createLabel(`Floor ${floor.name}`, [centroid[0], (labelLayer?.y ?? floor.y) + 0.08, centroid[1]], 1.15));
  }

  route.steps.forEach((step, index) => {
    const stepLayout = layout.steps[index];
    if (step.type === "stairs") addStairs(root, stepLayout.start, stepLayout.end, stepLayout.headingStart, step.riseM, step.runM, route.corridorWidthM);
    if (step.type === "door") addDoor(root, stepLayout.start, stepLayout.headingStart, step.label);
    if (step.type === "elevator") addElevator(root, stepLayout.start, stepLayout.end, route.corridorWidthM, step.toFloor);
  });

  addRouteLine(root, layout.centerline);
  const start = layout.centerline[0] ?? [0, 0, 0];
  const destination = layout.steps.at(-1)?.end ?? start;
  addMarker(root, "entrance-marker", start, 0x58b894, "Entrance");
  addMarker(root, "destination-marker", destination, palette.demo.accent, route.destination);

  let disposed = false;
  return {
    root,
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<MeshStandardMaterial | MeshBasicMaterial | SpriteMaterial>();
      root.traverse((object) => {
        if ("geometry" in object && object.geometry instanceof BufferGeometry) geometries.add(object.geometry);
        if ("material" in object && object.material) {
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (material instanceof MeshStandardMaterial || material instanceof MeshBasicMaterial || material instanceof SpriteMaterial) {
              materials.add(material);
            }
          }
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      const textures = new Set([...materials].flatMap((material) => material.map ? [material.map] : []));
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
      root.clear();
    },
  };
}

function addSlab(parent: Group, polygon: Polygon, y: number, ceilingHeight: number) {
  const shape = toShape(polygon);
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, new MeshStandardMaterial({
    color: palette.walkway.fill,
    roughness: 0.88,
    side: 2,
  }));
  mesh.name = "corridor-floor";
  mesh.position.y = y + 0.015;
  mesh.receiveShadow = true;
  mesh.userData.ceilingHeightM = ceilingHeight;
  parent.add(mesh);
}

function addWalls(parent: Group, polygon: Polygon, y: number) {
  for (const ring of polygon) {
    for (let i = 0; i < ring.length; i++) {
      const [x1, z1] = ring[i];
      const [x2, z2] = ring[(i + 1) % ring.length];
      const length = Math.hypot(x2 - x1, z2 - z1);
      if (length < 0.001) continue;
      const wall = new Mesh(
        new BoxGeometry(length + WALL_DEPTH * 0.35, WALL_HEIGHT, WALL_DEPTH),
        new MeshStandardMaterial({ color: palette.walls[3], transparent: true, opacity: 0.52, roughness: 0.84, depthWrite: false }),
      );
      wall.name = "corridor-wall";
      wall.position.set((x1 + x2) / 2, y + WALL_HEIGHT / 2, (z1 + z2) / 2);
      wall.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      parent.add(wall);
    }
  }
}

function addStairs(parent: Group, start: Vec3, end: Vec3, heading: number, riseM: number, runM: number, width: number) {
  const count = Math.max(1, Math.ceil(Math.abs(riseM) / 0.2));
  const direction = new Vector3(-Math.sin(heading), 0, -Math.cos(heading));
  const rise = (end[1] - start[1]) / count;
  const treadDepth = runM / count;
  for (let i = 0; i < count; i++) {
    const center = new Vector3(...start).addScaledVector(direction, (i + 0.5) * treadDepth);
    center.y += rise * (i + 0.5);
    const tread = new Mesh(
      new BoxGeometry(width, Math.max(Math.abs(rise), 0.035), Math.max(treadDepth, 0.04)),
      new MeshStandardMaterial({ color: palette.walkway.edge, roughness: 0.8 }),
    );
    tread.name = "stair-step";
    tread.position.copy(center);
    tread.rotation.y = heading;
    tread.castShadow = true;
    parent.add(tread);
  }
}

function addDoor(parent: Group, position: Vec3, heading: number, label: string | null) {
  const frame = new Group();
  frame.name = "door-frame";
  frame.position.set(...position);
  frame.rotation.y = heading;
  const material = new MeshStandardMaterial({ color: palette.door.frame, roughness: 0.58 });
  for (const x of [-0.55, 0.55]) {
    const post = new Mesh(new BoxGeometry(0.11, 2.15, 0.14), material);
    post.position.set(x, 1.075, 0);
    frame.add(post);
  }
  const lintel = new Mesh(new BoxGeometry(1.21, 0.13, 0.14), material);
  lintel.position.y = 2.15;
  frame.add(lintel);
  parent.add(frame);
  if (label) parent.add(createLabel(label, [position[0], position[1] + 2.35, position[2]], 1.3));
}

function addElevator(parent: Group, start: Vec3, end: Vec3, width: number, toFloor: string) {
  const height = Math.max(Math.abs(end[1] - start[1]), 0.35);
  const middle = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2] as Vec3;
  const shaft = new Group();
  shaft.name = "elevator-shaft";
  shaft.position.set(...middle);
  const material = new MeshStandardMaterial({ color: 0x86aed1, transparent: true, opacity: 0.28, roughness: 0.35, depthWrite: false });
  const sides = [
    [0, 0, -width / 2, width, height, 0.08],
    [0, 0, width / 2, width, height, 0.08],
    [-width / 2, 0, 0, 0.08, height, width],
    [width / 2, 0, 0, 0.08, height, width],
  ];
  for (const [x, y, z, sx, sy, sz] of sides) {
    const side = new Mesh(new BoxGeometry(sx, sy, sz), material);
    side.position.set(x, y, z);
    shaft.add(side);
  }
  shaft.userData.from = start;
  shaft.userData.to = end;
  parent.add(shaft);
  const label = createLabel(`Elevator to floor ${toFloor}`, [middle[0], middle[1] + height / 2 + 0.35, middle[2]], 1.5);
  label.name = "elevator-label";
  label.userData.text = `Elevator to floor ${toFloor}`;
  parent.add(label);
}

function addRouteLine(parent: Group, points: Vec3[]) {
  for (let i = 1; i < points.length; i++) {
    const from = new Vector3(...points[i - 1]);
    const to = new Vector3(...points[i]);
    const delta = to.clone().sub(from);
    if (delta.lengthSq() < 1e-8) continue;
    const line = new Mesh(
      new CylinderGeometry(ROUTE_RADIUS, ROUTE_RADIUS, delta.length(), 8),
      new MeshBasicMaterial({ color: 0xef6a4c }),
    );
    line.name = "route-line";
    line.position.copy(from).add(to).multiplyScalar(0.5);
    line.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize());
    line.userData.start = points[i - 1];
    line.userData.end = points[i];
    parent.add(line);
  }
  for (const point of points) {
    const joint = new Mesh(new SphereGeometry(ROUTE_RADIUS, 8, 6), new MeshBasicMaterial({ color: 0xef6a4c }));
    joint.name = "route-joint";
    joint.position.set(...point);
    parent.add(joint);
  }
}

function addMarker(parent: Group, name: string, point: Vec3, color: number, label: string) {
  const marker = new Mesh(new SphereGeometry(0.22, 12, 8), new MeshStandardMaterial({ color, roughness: 0.38, emissive: color, emissiveIntensity: 0.12 }));
  marker.name = name;
  marker.position.set(point[0], point[1] + 0.22, point[2]);
  parent.add(marker);
  parent.add(createLabel(label, [point[0], point[1] + 0.75, point[2]], 1.4));
}

function createLabel(text: string, position: Vec3, size: number) {
  const label = new Group();
  label.position.set(...position);
  label.userData.text = text;
  if (typeof document === "undefined") return label;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return label;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255,250,240,0.94)";
  context.strokeStyle = "#34514a";
  context.lineWidth = 5;
  roundRect(context, 8, 10, 496, 108, 20);
  context.fill();
  context.stroke();
  context.fillStyle = "#34514a";
  context.font = "bold 46px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 64, 460);
  const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true, depthTest: false }));
  sprite.scale.set(size, size * 0.25, 1);
  sprite.renderOrder = 3;
  label.add(sprite);
  return label;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function toShape(polygon: Polygon) {
  const [outer, ...holes] = polygon;
  const shape = new Shape();
  outer.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  for (const ring of holes) {
    const path = new Path();
    ring.forEach(([x, z], index) => {
      if (index === 0) path.moveTo(x, -z);
      else path.lineTo(x, -z);
    });
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

function polygonCentroid(polygon?: Polygon): [number, number] {
  const ring = polygon?.[0];
  if (!ring?.length) return [0, 0];
  const sum = ring.reduce(([x, z], point): [number, number] => [x + point[0], z + point[1]], [0, 0]);
  return [sum[0] / ring.length, sum[1] / ring.length];
}
