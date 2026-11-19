import { describe, expect, it } from "vitest";
import sampleJson from "../../../shared/fixtures/route.sample.json";
import type { Route } from "../../../shared/types";
import { layoutRoute } from "./layout";
import { RoutePlayback } from "./playback";

const sample = sampleJson as Route;

describe("RoutePlayback", () => {
  it("reports every step once in order and stops at the destination", () => {
    const changed: number[] = [];
    const playback = new RoutePlayback(sample, layoutRoute(sample), (index) => changed.push(index));
    playback.play(true);

    for (let i = 0; i < 200 && playback.isPlaying; i++) playback.update(0.25);

    expect(playback.isPlaying).toBe(false);
    expect(changed).toEqual(sample.steps.map((_, index) => index));
    expect(playback.pose.position).toEqual(layoutRoute(sample).steps.at(-1)?.end);
  });

  it("stops playback and places the marker at the requested step start", () => {
    const changed: number[] = [];
    const playback = new RoutePlayback(sample, layoutRoute(sample), (index) => changed.push(index));
    playback.play(true);
    playback.update(0.25);

    playback.goto(6);

    expect(playback.isPlaying).toBe(false);
    expect(playback.pose.stepIndex).toBe(6);
    expect(playback.pose.position).toEqual(layoutRoute(sample).steps[6].start);
  });

  it("smoothly rotates through a turn and climbs the stair centerline", () => {
    const playback = new RoutePlayback(sample, layoutRoute(sample), () => {});
    playback.goto(2);
    playback.play(true);
    playback.update(0.36);
    expect(playback.pose.heading).toBeCloseTo(
      (layoutRoute(sample).steps[2].headingStart + layoutRoute(sample).steps[2].headingEnd) / 2,
    );

    playback.goto(6);
    playback.play(true);
    playback.update(0.4);
    expect(playback.pose.position[1]).toBeGreaterThan(layoutRoute(sample).steps[6].start[1]);
    expect(playback.pose.position[1]).toBeLessThan(layoutRoute(sample).steps[6].end[1]);
  });
});
