import {
  BoxGeometry, BufferGeometry, Camera, Group, Line, LineBasicMaterial,
  Mesh, MeshBasicMaterial, OctahedronGeometry, SphereGeometry, Vector3,
} from "three";
import type { Campus, Event } from "../../../shared/types";

type State = "live" | "soon" | "later";
type TouchLayer = { container: HTMLElement; onTap: (eventId: string) => void };
type Flag = {
  marker: Mesh<BufferGeometry, MeshBasicMaterial>;
  stem: Line<BufferGeometry, LineBasicMaterial>;
  tip: Vector3;
  state: State;
  button?: HTMLButtonElement;
  leader?: HTMLElement;
};

const labels = { live: "Live now", soon: "Starting soon", later: "Later today" };
const colors = { live: 0xff8672, soon: 0xf3c66e, later: 0x9ab9e9 };
const touchSize = 44;
const offsets = [[0, 0]];
for (const distance of [touchSize, 65, 90, 120]) {
  for (let direction = 0; direction < 8; direction++) {
    const angle = direction * Math.PI / 4;
    offsets.push([Math.cos(angle) * distance, Math.sin(angle) * distance]);
  }
}

function appearance(event: Event, nowMs: number): { state: State; heightM: number } | undefined {
  const startMs = Date.parse(event.startsAt);
  const endMs = Date.parse(event.endsAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= nowMs) return;
  const minutes = (startMs - nowMs) / 60_000;
  if (minutes <= 0) return { state: "live", heightM: 30 };
  return { state: minutes <= 60 ? "soon" : "later", heightM: 12 + 18 * (1 - Math.min(minutes / 240, 1)) };
}

function flagGeometry(state: State) {
  if (state === "live") return new SphereGeometry(2.4, 12, 8);
  if (state === "soon") return new BoxGeometry(5, 3.5, 1.6);
  return new OctahedronGeometry(2.2);
}

function addTouchTarget(layer: HTMLElement, event: Event, buildingName: string, state: State, onTap: TouchLayer["onTap"]) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "campus-flag";
  button.dataset.state = state;
  button.dataset.eventId = event.id;
  button.setAttribute("aria-label", `${event.title}. ${labels[state]}. ${buildingName}`);
  const marker = document.createElement("span");
  marker.className = "campus-flag-marker";
  const label = document.createElement("span");
  label.className = "campus-flag-label";
  label.textContent = event.title;
  button.append(marker, label);
  button.addEventListener("click", () => onTap(event.id));

  const leader = document.createElement("span");
  leader.className = "campus-flag-leader";
  leader.setAttribute("aria-hidden", "true");
  leader.style.backgroundColor = `#${colors[state].toString(16)}`;
  layer.append(leader, button);
  return { button, leader };
}

/**
 * Attach the event layer to a MAP-3 scene group. Call project(camera) on render
 * frames, update on campus:load, and use select's point for camera easing.
 * Pass a positioned canvas container and the bridge callback for touch targets.
 */
export function createFlags(
  group: Group,
  campus: Campus,
  events: readonly Event[],
  now: string,
  touch?: TouchLayer,
) {
  const root = new Group();
  root.name = "campus-event-flags";
  group.add(root);
  const layer = touch && document.createElement("div");
  if (layer) {
    layer.className = "campus-flags";
    const style = document.createElement("style");
    style.textContent = flagStyles;
    layer.append(style);
    touch.container.append(layer);
  }

  const flags = new Map<string, Flag>();
  const projected = new Vector3();
  let selected: string | null = null;

  function clear() {
    for (const flag of flags.values()) {
      flag.stem.geometry.dispose();
      flag.stem.material.dispose();
      flag.marker.geometry.dispose();
      flag.marker.material.dispose();
      flag.button?.remove();
      flag.leader?.remove();
    }
    root.clear();
    flags.clear();
  }

  function select(eventId: string | null) {
    selected = eventId !== null && flags.has(eventId) ? eventId : null;
    for (const [id, flag] of flags) {
      flag.button?.setAttribute("aria-pressed", String(id === selected));
      flag.marker.scale.setScalar(id === selected ? 1.35 : 1);
    }
    const flag = selected === null ? undefined : flags.get(selected);
    return flag && root.localToWorld(flag.tip.clone());
  }

  function update(nextCampus: Campus, nextEvents: readonly Event[], nextNow: string) {
    clear();
    const timestamp = Date.parse(nextNow);
    const activeByBuilding = new Map<string, { event: Event; state: State; heightM: number }[]>();
    for (const event of nextEvents) {
      const visual = appearance(event, timestamp);
      if (!visual) continue;
      const id = event.location.buildingId;
      const active = activeByBuilding.get(id) ?? [];
      active.push({ event, ...visual });
      activeByBuilding.set(id, active);
    }

    for (const building of nextCampus.buildings) {
      const active = activeByBuilding.get(building.id) ?? [];
      const [x, z] = building.entrance;
      active.forEach(({ event, state, heightM }, index) => {
        const base = new Vector3(x, 0, z);
        const tip = new Vector3(x + (index - (active.length - 1) / 2) * 22, heightM, z);
        const stem = new Line(
          new BufferGeometry().setFromPoints([base, tip]),
          new LineBasicMaterial({ color: colors[state], transparent: true, opacity: 0.75 }),
        );
        const marker = new Mesh(flagGeometry(state), new MeshBasicMaterial({ color: colors[state] }));
        marker.position.copy(tip);
        marker.visible = !layer;

        const flagRoot = new Group();
        flagRoot.name = event.id;
        flagRoot.add(stem, marker);
        root.add(flagRoot);

        const flag: Flag = { marker, stem, tip, state };
        if (layer && touch) Object.assign(flag, addTouchTarget(layer, event, building.name, state, touch.onTap));
        flags.set(event.id, flag);
      });
    }
    select(selected);
  }

  function project(camera: Camera, elapsedMs = performance.now()) {
    const width = layer?.clientWidth ?? 0;
    const height = layer?.clientHeight ?? 0;
    const occupied: [number, number][] = [];
    for (const [id, { button, leader, tip, marker, state }] of flags) {
      if (!button || !leader) {
        const pulse = state === "live" ? 1 + 0.12 * Math.sin(elapsedMs / 240) : 1;
        marker.scale.setScalar(pulse * (id === selected ? 1.35 : 1));
        continue;
      }

      root.localToWorld(projected.copy(tip)).project(camera);
      button.hidden = Math.abs(projected.z) > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      leader.hidden = true;
      if (button.hidden) continue;

      const x = (projected.x + 1) * width / 2;
      const y = (1 - projected.y) * height / 2;
      let center: [number, number] = [x, y];
      for (const [dx, dy] of offsets) {
        const left = Math.min(width - touchSize / 2, Math.max(touchSize / 2, x + dx));
        const top = Math.min(height - touchSize / 2, Math.max(touchSize / 2, y + dy));
        if (occupied.every(([otherX, otherY]) =>
          Math.abs(otherX - left) >= touchSize || Math.abs(otherY - top) >= touchSize,
        )) {
          center = [left, top];
          break;
        }
      }
      occupied.push(center);
      const [left, top] = center;
      button.style.left = `${left}px`;
      button.style.top = `${top}px`;

      const length = Math.hypot(left - x, top - y);
      if (length > 2) {
        leader.hidden = false;
        leader.style.left = `${x}px`;
        leader.style.top = `${y}px`;
        leader.style.width = `${length}px`;
        leader.style.transform = `rotate(${Math.atan2(top - y, left - x)}rad)`;
      }
    }
  }

  update(campus, events, now);
  return {
    update, project, select,
    dispose() {
      clear();
      root.removeFromParent();
      layer?.remove();
    },
  };
}

const flagStyles = `
.campus-flags {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.campus-flag {
  position: absolute;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  touch-action: manipulation;
  cursor: pointer;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #f8f6ee;
  font: 600 .75rem system-ui, sans-serif;
}

.campus-flag[hidden] { display: none; }
.campus-flag-leader {
  position: absolute;
  height: 1px;
  opacity: .75;
  transform-origin: left;
}
.campus-flag[data-state="live"] { --flag: #ff8672; }
.campus-flag[data-state="soon"] { --flag: #f3c66e; }
.campus-flag[data-state="later"] { --flag: #9ab9e9; }

.campus-flag-marker {
  width: 23px;
  height: 23px;
  background: var(--flag);
  border: 2px solid #18271f;
  border-radius: 6px 10px 10px 2px;
  box-shadow: 0 2px 10px #09110d90;
  transform: rotate(-8deg);
}

.campus-flag[data-state="live"] .campus-flag-marker {
  border-radius: 50%;
  animation: flag-pulse 1.8s ease-out infinite;
}

.campus-flag[data-state="later"] .campus-flag-marker {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  transform: rotate(45deg);
}

@keyframes flag-pulse {
  from { box-shadow: 0 0 0 0 #ff8672aa; }
  to { box-shadow: 0 0 0 9px #ff867200; }
}

@media (prefers-reduced-motion: reduce) {
  .campus-flag[data-state="live"] .campus-flag-marker { animation: none; }
}

.campus-flag:focus-visible, .campus-flag[aria-pressed="true"] {
  outline: 2px solid var(--flag);
  outline-offset: -4px;
}

.campus-flag-label {
  display: none;
  position: absolute;
  bottom: 100%;
  width: max-content;
  max-width: 150px;
  padding: 6px 9px;
  border: 1px solid #ffffff25;
  border-radius: 7px;
  background: #13221d;
  pointer-events: none;
}

.campus-flag:hover, .campus-flag:focus-visible, .campus-flag[aria-pressed="true"] { z-index: 1; }
.campus-flag:hover .campus-flag-label,
.campus-flag:focus-visible .campus-flag-label,
.campus-flag[aria-pressed="true"] .campus-flag-label { display: block; }
`;
