import campus from "../../shared/fixtures/campus.json";
import eventSeeds from "../../shared/fixtures/events.seed.json";
import route from "../../shared/fixtures/route.sample.json";
import type { Campus, EventSeed, Route } from "../../shared/types";
import type { CampusLoad, RouteLoad } from "./bridge";
import { seedStart } from "../../shared/seedTimes";

export function browserLoad(search: string, now: Date): CampusLoad | RouteLoad | undefined {
  const scene = new URLSearchParams(search).get("scene");
  if (scene === "route") {
    return { type: "route:load", route: route as Route };
  }
  if (scene === "campus") {
    const seeds = eventSeeds as EventSeed[];
    const events = seeds
      .map(({ startsInMin, durationMin, ...event }) => {
        const start = seedStart(startsInMin, now).getTime();
        return {
          ...event,
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(start + durationMin * 60_000).toISOString(),
        };
      })
      .filter(event => event.status !== 'cancelled' && Date.parse(event.startsAt) < now.getTime() + 24 * 60 * 60_000 && Date.parse(event.endsAt) > now.getTime())
      .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt));
    return { type: "campus:load", campus: campus as Campus, events, now: now.toISOString() };
  }
}
