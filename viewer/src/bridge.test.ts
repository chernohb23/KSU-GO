import { describe, expect, it, vi } from "vitest";
import { installBridge, type IncomingMessage } from "./bridge";
import campusJson from "../../shared/fixtures/campus.json";
import route from "../../shared/fixtures/route.sample.json";
import type { Campus, Route } from "../../shared/types";

const campus = campusJson as Campus;

const validMessages: IncomingMessage[] = [
  { type: "campus:load", campus, events: [], now: "2026-11-17T12:00:00Z" },
  { type: "campus:load", campus, events: [], now: "2026-11-17T12:00:00Z", savedEventIds: ["event-1"] },
  { type: "campus:select", eventId: "event-1" },
  { type: "campus:select", eventId: null },
  { type: "route:load", route: route as Route },
  { type: "route:goto", stepIndex: 0 },
  { type: "route:goto", stepIndex: 3 },
  { type: "route:play", playing: true },
  { type: "route:play", playing: false },
];

describe("viewer bridge", () => {
  it("installs receive before sending ready and serializes native messages", () => {
    const postMessage = vi.fn(() => {
      expect(host).toHaveProperty("ksugo.receive", expect.any(Function));
    });
    const host = { ReactNativeWebView: { postMessage } };
    const send = installBridge(host, vi.fn(), vi.fn());
    send({ type: "route:stepChanged", stepIndex: 1 });

    expect(postMessage.mock.calls).toEqual([
      ['{"type":"ready"}'],
      ['{"type":"route:stepChanged","stepIndex":1}'],
    ]);
  });

  it("reports an unknown message and still accepts the next message", () => {
    const host = { ksugo: { receive: vi.fn<(message: unknown) => void>() } };
    const dispatch = vi.fn();
    const log = vi.fn();
    installBridge(host, dispatch, log);
    host.ksugo.receive({ type: "missing" });
    const next = { type: "route:goto", stepIndex: 2 };
    host.ksugo.receive(next);

    expect(log).toHaveBeenCalledWith({ type: "error", message: expect.stringContaining("missing") });
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(next);
  });

  it.each(validMessages)("dispatches a valid $type payload unchanged", (message) => {
    const host = { ksugo: { receive: vi.fn<(message: unknown) => void>() } };
    const dispatch = vi.fn();
    const log = vi.fn();
    installBridge(host, dispatch, log);
    host.ksugo.receive(message);

    expect(dispatch).toHaveBeenCalledExactlyOnceWith(message);
    expect(log.mock.calls).toEqual([[{ type: "ready" }]]);
  });

  const campusLoad = validMessages[0];
  const invalidMessages: unknown[] = [
    { type: "campus:load", events: [], now: "now" },
    { ...campusLoad, campus: null },
    { ...campusLoad, campus: [] },
    { ...campusLoad, events: undefined },
    { ...campusLoad, events: {} },
    { ...campusLoad, events: [null] },
    { ...campusLoad, now: undefined },
    { ...campusLoad, now: 123 },
    { ...campusLoad, savedEventIds: "event-1" },
    { ...campusLoad, savedEventIds: [1] },
    { type: "campus:select" },
    { type: "campus:select", eventId: 1 },
    { type: "route:load" },
    { type: "route:load", route: null },
    { type: "route:load", route: [] },
    { type: "route:load", route: "route-1" },
    { type: "route:goto" },
    ...["1", null, -1, 0.5, NaN, Infinity, -Infinity].map((stepIndex) => ({ type: "route:goto", stepIndex })),
    { type: "route:play" },
    { type: "route:play", playing: "false" },
    { type: "route:play", playing: 0 },
  ];

  it.each(invalidMessages)("rejects malformed payload %# without dispatching and accepts the next valid message", (message) => {
    const host = { ksugo: { receive: vi.fn<(message: unknown) => void>() } };
    const dispatch = vi.fn();
    const log = vi.fn();
    installBridge(host, dispatch, log);
    host.ksugo.receive(message);

    expect(dispatch).not.toHaveBeenCalled();
    expect(log).toHaveBeenLastCalledWith({ type: "error", message: expect.stringContaining("Invalid payload") });

    const next = { type: "route:play", playing: false };
    host.ksugo.receive(next);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(next);
  });
});
