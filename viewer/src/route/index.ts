import type { RouteCommand, RouteLoad } from "../bridge";
import { createPlaceholder } from "../scene";

export function createRouteScene(container: HTMLElement) {
  return createPlaceholder<RouteLoad, RouteCommand>(container, 0x192a3d, 0x71bbdc);
}
