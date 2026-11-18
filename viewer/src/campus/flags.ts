import {
  BoxGeometry, BufferGeometry, Group, Line, LineBasicMaterial,
  Mesh, MeshBasicMaterial, OctahedronGeometry, SphereGeometry, Vector3,
} from "three";
import type { Event } from "../../../shared/types";
import type { CreateFlags } from "./flagsSeam";

type State = "live" | "soon" | "later";

const colors = { live: 0xff8672, soon: 0xf3c66e, later: 0x9ab9e9 };

function appearance(event: Event, nowMs: number): { state: State; heightM: number } | undefined {
  const startMs = Date.parse(event.startsAt);
  const endMs = Date.parse(event.endsAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= nowMs) return;
  const minutes = (startMs - nowMs) / 60_000;
  if (minutes <= 0) return { state: "live", heightM: 30 };
  return { state: minutes <= 60 ? "soon" : "later", heightM: 12 + 18 * (1 - Math.min(minutes / 240, 1)) };
}

function markerGeometry(state: State) {
  if (state === "live") return new SphereGeometry(3.1, 12, 8);
  if (state === "soon") return new BoxGeometry(6.2, 4.8, 3.4);
  return new OctahedronGeometry(3.3);
}

export const createFlags: CreateFlags = (flagsLayer, campus, events, now) => {
  const activeByBuilding = new Map<string, { event: Event; state: State; heightM: number }[]>();
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
    pole: Line<BufferGeometry, LineBasicMaterial>;
    marker: Mesh<BufferGeometry, MeshBasicMaterial>;
    live: boolean;
  }[] = [];
  let elapsedSeconds = 0;
  for (const building of campus.buildings) {
    const active = activeByBuilding.get(building.id) ?? [];
    const [x, z] = building.entrance;
    active.forEach(({ event, state, heightM }, index) => {
      const offset = (index - (active.length - 1) / 2) * 22;
      const base = new Vector3(x, 0, z);
      // Fan across the default map view while all poles start at the entrance.
      const tip = new Vector3(x + offset * 0.4, heightM, z + offset * 0.92);
      const pole = new Line(
        new BufferGeometry().setFromPoints([base, tip]),
        new LineBasicMaterial({ color: colors[state], transparent: true, opacity: 0.8 }),
      );
      const marker = new Mesh(markerGeometry(state), new MeshBasicMaterial({ color: colors[state], depthTest: false }));
      marker.name = "flag-marker";
      marker.position.copy(tip);
      marker.renderOrder = 2;

      const flag = new Group();
      flag.name = event.id;
      flag.add(pole, marker);
      flagsLayer.add(flag);
      flags.push({ flag, pole, marker, live: state === "live" });
    });
  }

  return {
    update(dtSeconds) {
      elapsedSeconds += dtSeconds;
      let animating = false;
      for (const { flag, marker, live } of flags) {
        const pulse = live ? 1 + 0.18 * Math.sin(elapsedSeconds * Math.PI * 2 / 1.6) : 1;
        marker.scale.setScalar(pulse * (flag.userData.selected ? 1.5 : 1));
        animating ||= live;
      }
      return animating;
    },
    dispose() {
      for (const { flag, pole, marker } of flags) {
        pole.geometry.dispose();
        pole.material.dispose();
        marker.geometry.dispose();
        marker.material.dispose();
        flag.removeFromParent();
      }
      flags.length = 0;
    },
  };
};
