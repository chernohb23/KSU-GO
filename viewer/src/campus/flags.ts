import {
  BufferAttribute, BufferGeometry, CircleGeometry, CylinderGeometry, DoubleSide, Group,
  Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, Shape, ShapeGeometry,
} from "three";
import type { Event } from "../../../shared/types";
import { palette } from "../palette";
import type { CreateFlags } from "./flagsSeam";
import { ROOF_DECK_OFFSET_M, roofPositions } from "./roof";

type State = "live" | "soon" | "later";

function appearance(event: Event, nowMs: number): { state: State; heightM: number } | undefined {
  const startMs = Date.parse(event.startsAt);
  const endMs = Date.parse(event.endsAt);
  if (event.status === "cancelled" || !Number.isFinite(nowMs) || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= nowMs) return;
  const minutes = (startMs - nowMs) / 60_000;
  if (minutes <= 0) return { state: "live", heightM: 30 };
  return { state: minutes <= 60 ? "soon" : "later", heightM: 12 + 18 * (1 - Math.min(minutes / 240, 1)) };
}

function markerGeometry(state: State) {
  if (state === "live") return new PlaneGeometry(13, 9, 8);
  if (state === "soon") return new PlaneGeometry(13, 9);
  return new BufferGeometry().setAttribute("position", new BufferAttribute(
    new Float32Array([-5.5, 4, 0, -5.5, -4, 0, 5.5, 0, 0]), 3,
  ));
}

const FLAG_ANGLE = -Math.atan2(0.92, 0.4);

function savedStar() {
  const shape = new Shape();
  shape.moveTo(0, 4);
  for (let point = 1; point < 10; point++) {
    const angle = point * Math.PI / 5;
    const radius = point % 2 === 0 ? 4 : 1.8;
    shape.lineTo(Math.sin(angle) * radius, Math.cos(angle) * radius);
  }
  shape.closePath();
  const star = new Mesh(new ShapeGeometry(shape), new MeshBasicMaterial({
    color: palette.ui.text, side: DoubleSide, depthTest: false, depthWrite: false,
  }));
  star.renderOrder = 4;
  const badge = new Mesh(new CircleGeometry(5.8, 20), new MeshBasicMaterial({
    color: palette.demo.trim, side: DoubleSide, depthTest: false, depthWrite: false,
  }));
  badge.name = "flag-saved";
  badge.position.y = 6;
  badge.renderOrder = 3;
  badge.add(star);
  return badge;
}

export const createFlags: CreateFlags = (flagsLayer, campus, events, now, savedEventIds) => {
  const activeByBuilding = new Map<string, { event: Event; state: State; heightM: number }[]>();
  const saved = new Set(savedEventIds);
  const nowMs = Date.parse(now);
  for (const event of events) {
    const visual = appearance(event, nowMs);
    if (!visual) continue;
    const id = event.location.buildingId;
    const active = activeByBuilding.get(id) ?? [];
    active.push({ event, ...visual });
    activeByBuilding.set(id, active);
  }

  const flags: {
    flag: Group;
    marker: Mesh<BufferGeometry, MeshBasicMaterial>;
    pulse?: Mesh<RingGeometry, MeshBasicMaterial>;
  }[] = [];
  let elapsedSeconds = 0;
  for (const building of campus.buildings) {
    const active = activeByBuilding.get(building.id) ?? [];
    const positions = roofPositions(building.footprint, active.length);
    active.forEach(({ event, state, heightM }, index) => {
      const flag = new Group();
      flag.name = event.id;
      flag.position.set(positions[index][0], building.heightM + ROOF_DECK_OFFSET_M, positions[index][1]);
      flag.userData.buildingId = building.id;

      const hardware = new MeshBasicMaterial({ color: palette.ui.text });
      const pole = new Mesh(new CylinderGeometry(0.65, 0.85, heightM, 8), hardware);
      pole.name = "flag-pole";
      pole.position.y = heightM / 2;
      const base = new Mesh(new CylinderGeometry(2, 2.6, 0.6, 12), hardware);
      base.name = "flag-base";
      base.position.y = 0.3;

      const cloth = new Group();
      cloth.position.y = heightM;
      cloth.rotation.y = FLAG_ANGLE;
      const marker = new Mesh(markerGeometry(state), new MeshBasicMaterial({
        color: palette.flags[state], side: DoubleSide, depthTest: false, depthWrite: false,
      }));
      marker.name = "flag-marker";
      marker.geometry.computeBoundingBox();
      marker.position.set(-marker.geometry.boundingBox!.min.x, -marker.geometry.boundingBox!.max.y, 0);
      marker.renderOrder = 2;
      cloth.add(marker);
      if (saved.has(event.id)) cloth.add(savedStar());
      flag.add(base, pole, cloth);

      let pulse: (typeof flags)[number]["pulse"];
      if (state === "live") {
        pulse = new Mesh(new RingGeometry(2.8, 3.5, 24), new MeshBasicMaterial({
          color: palette.flags.live, transparent: true, depthWrite: false,
        }));
        pulse.name = "flag-pulse";
        pulse.rotation.x = -Math.PI / 2;
        pulse.position.y = 0.15;
        flag.add(pulse);
      }
      flagsLayer.add(flag);
      flags.push({ flag, marker, pulse });
    });
  }

  return {
    update(dtSeconds) {
      elapsedSeconds += dtSeconds;
      let animating = false;
      for (const { flag, marker, pulse } of flags) {
        const scale = flag.userData.selected ? 1.5 : 1;
        marker.scale.setScalar(scale);
        const bounds = marker.geometry.boundingBox!;
        marker.position.set(-bounds.min.x * scale, -bounds.max.y * scale, 0);
        if (!pulse) continue;
        animating = true;
        const positions = marker.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const across = (positions.getX(i) - bounds.min.x) / (bounds.max.x - bounds.min.x);
          positions.setZ(i, across * 1.7 * Math.sin(across * Math.PI * 2 - elapsedSeconds * 5));
        }
        positions.needsUpdate = true;
        const phase = (elapsedSeconds % 1.6) / 1.6;
        pulse.scale.setScalar(1 + phase * 1.8);
        pulse.material.opacity = 0.8 * (1 - phase);
      }
      return animating;
    },
    dispose() {
      for (const { flag } of flags) {
        const materials = new Set<MeshBasicMaterial>();
        flag.traverse(object => {
          if (object instanceof Mesh) {
            object.geometry.dispose();
            materials.add(object.material);
          }
        });
        materials.forEach(material => material.dispose());
        flag.removeFromParent();
      }
      flags.length = 0;
    },
  };
};
