import type { Route } from "../../../shared/types";
import type { RouteLayout, StepLayout, Vec3 } from "./layout";

export type RoutePose = { position: Vec3; heading: number; stepIndex: number };

const WALK_SPEED_MPS = 1.4;
const TURN_SECONDS = 0.72;

/** Advances a marker through route steps at a constant walking speed. */
export class RoutePlayback {
  private stepIndex = 0;
  private elapsed = 0;
  private playing = false;
  private entered = false;
  private finished = false;
  private poseValue: RoutePose;

  constructor(
    private readonly route: Route,
    private readonly layout: RouteLayout,
    private readonly onStepChanged: (stepIndex: number) => void,
  ) {
    const first = layout.steps[0];
    this.poseValue = { position: first?.start ?? [0, 0, 0], heading: first?.headingStart ?? 0, stepIndex: 0 };
  }

  get pose(): RoutePose { return this.poseValue; }
  get isPlaying(): boolean { return this.playing; }

  play(playing: boolean) {
    if (playing && this.finished && !this.playing) {
      this.stepIndex = 0;
      this.elapsed = 0;
      this.entered = false;
      this.finished = false;
      const first = this.layout.steps[0];
      this.poseValue = { position: first?.start ?? [0, 0, 0], heading: first?.headingStart ?? 0, stepIndex: 0 };
    }
    this.playing = playing;
  }

  goto(index: number) {
    this.playing = false;
    this.stepIndex = Math.max(0, Math.min(this.layout.steps.length - 1, Math.trunc(index)));
    this.elapsed = 0;
    this.entered = true;
    this.finished = false;
    const step = this.layout.steps[this.stepIndex];
    if (!step) return;
    this.poseValue = { position: step.start, heading: step.headingStart, stepIndex: this.stepIndex };
    this.onStepChanged(this.stepIndex);
  }

  update(deltaSeconds: number) {
    if (!this.playing || this.layout.steps.length === 0) return;
    let remaining = Math.max(deltaSeconds, 0);
    while (this.playing) {
      const step = this.layout.steps[this.stepIndex];
      if (!step) { this.playing = false; break; }
      if (!this.entered) {
        this.entered = true;
        this.onStepChanged(this.stepIndex);
      }
      const duration = stepDuration(this.route.steps[this.stepIndex], step);
      if (duration === 0 || this.elapsed >= duration) {
        this.poseValue = { position: step.end, heading: step.headingEnd, stepIndex: this.stepIndex };
        this.elapsed = 0;
        this.entered = false;
        if (this.stepIndex === this.layout.steps.length - 1) {
          this.playing = false;
          this.finished = true;
          break;
        }
        this.stepIndex++;
        continue;
      }
      const used = Math.min(remaining, duration - this.elapsed);
      this.elapsed += used;
      remaining -= used;
      const progress = this.elapsed / duration;
      this.poseValue = {
        position: lerp3(step.start, step.end, progress),
        heading: step.headingStart + (step.headingEnd - step.headingStart) * progress,
        stepIndex: this.stepIndex,
      };
      if (remaining <= 0) break;
    }
  }
}

function stepDuration(step: Route["steps"][number] | undefined, layout: StepLayout): number {
  if (!step || step.type === "door") return 0;
  if (step.type === "turn") return TURN_SECONDS;
  const distance = Math.hypot(
    layout.end[0] - layout.start[0],
    layout.end[1] - layout.start[1],
    layout.end[2] - layout.start[2],
  );
  return distance / WALK_SPEED_MPS;
}

function lerp3(from: Vec3, to: Vec3, t: number): Vec3 {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}
