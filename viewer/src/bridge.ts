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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const payloadValidators = {
  "campus:load": (message) => isRecord(message.campus)
    && Array.isArray(message.events) && message.events.every(isRecord)
    && typeof message.now === "string"
    && (message.savedEventIds === undefined || (
      Array.isArray(message.savedEventIds) && message.savedEventIds.every((id) => typeof id === "string")
    )),
  "campus:select": (message) => message.eventId === null || typeof message.eventId === "string",
  "route:load": (message) => isRecord(message.route),
  "route:goto": (message) => typeof message.stepIndex === "number"
    && Number.isFinite(message.stepIndex) && Number.isInteger(message.stepIndex) && message.stepIndex >= 0,
  "route:play": (message) => typeof message.playing === "boolean",
} satisfies Record<IncomingMessage["type"], (message: Record<string, unknown>) => boolean>;

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

      if (!isRecord(message) || !payloadValidators[type as IncomingMessage["type"]](message)) {
        send({ type: "error", message: `Invalid payload for message type: ${type}` });
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
