import type { Campus, Event, Route } from "../../shared/types";

export type CampusLoad = {
  type: "campus:load";
  campus: Campus;
  events: Event[];
  now: string;
  savedEventIds?: string[];
};

export type RouteLoad = { type: "route:load"; route: Route };
export type CampusCommand = { type: "campus:select"; eventId: string | null };
export type RouteCommand =
  | { type: "route:goto"; stepIndex: number }
  | { type: "route:play"; playing: boolean };

export type IncomingMessage = CampusLoad | RouteLoad | CampusCommand | RouteCommand;
export type OutgoingMessage =
  | { type: "ready" }
  | { type: "campus:flagTapped"; eventId: string }
  | { type: "route:stepChanged"; stepIndex: number }
  | { type: "error"; message: string };

type BridgeHost = {
  ksugo?: { receive(message: unknown): void };
  ReactNativeWebView?: { postMessage(message: string): void };
};

declare global {
  interface Window extends BridgeHost {}
}

const incomingTypes = {
  "campus:load": true,
  "campus:select": true,
  "route:load": true,
  "route:goto": true,
  "route:play": true,
} satisfies Record<IncomingMessage["type"], true>;

export function installBridge(
  host: BridgeHost,
  dispatch: (message: IncomingMessage) => void,
  log: (message: OutgoingMessage) => void,
) {
  function send(message: OutgoingMessage) {
    if (host.ReactNativeWebView) {
      host.ReactNativeWebView.postMessage(JSON.stringify(message));
    } else {
      log(message);
    }
  }

  host.ksugo = {
    receive(message) {
      const type = message && typeof message === "object" && "type" in message
        ? message.type
        : undefined;
      if (typeof type !== "string" || !Object.hasOwn(incomingTypes, type)) {
        send({
          type: "error",
          message: typeof type === "string" ? `Unknown message type: ${type}` : "Missing message type",
        });
        return;
      }

      try {
        dispatch(message as IncomingMessage);
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };

  send({ type: "ready" });
  return send;
}
