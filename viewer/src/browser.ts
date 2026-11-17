import campus from "../../shared/fixtures/campus.json";
import eventSeeds from "../../shared/fixtures/events.seed.json";
import route from "../../shared/fixtures/route.sample.json";
import type { Campus, EventSeed, Route } from "../../shared/types";
import type { CampusLoad, RouteLoad } from "./bridge";

export function browserLoad(search: string, now: Date): CampusLoad | RouteLoad | undefined {
  const scene = new URLSearchParams(search).get("scene");
  if (scene === "route") {
    return { type: "route:load", route: route as Route };
  }
  if (scene === "campus") {
    const seeds = eventSeeds as EventSeed[];
    const events = seeds
      .filter(({ startsInMin, durationMin }) => startsInMin < 24 * 60 && startsInMin + durationMin > 0)
      .sort((first, second) => first.startsInMin - second.startsInMin)
      .map(({ startsInMin, durationMin, ...event }) => {
        const start = now.getTime() + startsInMin * 60_000;
        return {
          ...event,
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(start + durationMin * 60_000).toISOString(),
        };
      });
    return { type: "campus:load", campus: campus as Campus, events, now: now.toISOString() };
  }
}
