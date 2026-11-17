import { expect, it } from "vitest";
import { browserLoad } from "./browser";

it("loads only unended events starting less than 24 hours away, in start order", () => {
  const now = new Date("2026-11-17T12:00:00.000Z");
  const message = browserLoad("?scene=campus", now);
  expect(message?.type).toBe("campus:load");
  if (message?.type !== "campus:load") return;

  expect(message.now).toBe(now.toISOString());
  expect(message.events.length).toBeGreaterThan(0);
  expect(message.events.every(({ startsAt, endsAt }) =>
    Date.parse(startsAt) < now.getTime() + 24 * 60 * 60_000 &&
    Date.parse(endsAt) > now.getTime(),
  )).toBe(true);
  const starts = message.events.map(({ startsAt }) => startsAt);
  expect(starts).toEqual([...starts].sort());
});
