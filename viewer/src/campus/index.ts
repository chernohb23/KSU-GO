import type { CampusCommand, CampusLoad } from "../bridge";
import { createPlaceholder } from "../scene";

export function createCampusScene(container: HTMLElement) {
  return createPlaceholder<CampusLoad, CampusCommand>(container, 0x192d25, 0xe9ab43);
}
