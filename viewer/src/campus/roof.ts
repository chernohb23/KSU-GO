import { distToRing, pointInRing, ringBounds, type XZ } from "./geometry";

/** The rendered deck surface above the building's wall height. */
export const ROOF_DECK_OFFSET_M = 0.35;

/** Center the first flag on the roof; concave footprints use their broadest interior. */
export function roofCenter(ring: readonly XZ[]): XZ {
  const bounds = ringBounds(ring);
  const center: XZ = [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
  if (pointInRing(...center, ring) && distToRing(...center, ring) >= 2.8) return center;
  let best: XZ = ring[0] ? [...ring[0]] : [0, 0];
  let radius = -1;
  // Refine a grid rather than trusting a polygon centroid, which may be outside an L.
  let search = bounds;
  for (let pass = 0; pass < 4; pass++) {
    const dx = (search.maxX - search.minX) / 12, dz = (search.maxZ - search.minZ) / 12;
    for (let x = 0; x <= 12; x++) for (let z = 0; z <= 12; z++) {
      const candidate: XZ = [search.minX + dx * x, search.minZ + dz * z];
      if (!pointInRing(...candidate, ring)) continue;
      const distance = distToRing(...candidate, ring);
      if (distance > radius) { best = candidate; radius = distance; }
    }
    search = { minX: best[0] - dx, maxX: best[0] + dx, minZ: best[1] - dz, maxZ: best[1] + dz };
  }
  return best;
}

/** Nearby roof positions with the base discs kept inside the footprint. */
export function roofPositions(ring: readonly XZ[], count: number): XZ[] {
  if (!count) return [];
  const center = roofCenter(ring);
  const clearance = Math.min(2.8, Math.max(0, distToRing(...center, ring) * 0.7));
  const radius = 18;
  const candidates: XZ[] = [];
  for (let x = -radius; x <= radius; x += 2) for (let z = -radius; z <= radius; z += 2) {
    const point: XZ = [center[0] + x, center[1] + z];
    if (Math.hypot(x, z) > radius || !pointInRing(...point, ring) || distToRing(...point, ring) < clearance) continue;
    candidates.push(point);
  }
  const placed: XZ[] = [center];
  while (placed.length < count) {
    let best = -1, bestScore = -Infinity;
    candidates.forEach((candidate, index) => {
      const separation = Math.min(...placed.map(point => Math.hypot(point[0] - candidate[0], point[1] - candidate[1])));
      // Prefer a compact cluster, with enough separation to keep poles individually visible.
      const score = Math.min(separation, 8) - 0.12 * Math.hypot(candidate[0] - center[0], candidate[1] - center[1]);
      if (score > bestScore) { best = index; bestScore = score; }
    });
    placed.push(best >= 0 ? candidates.splice(best, 1)[0] : [...center]);
  }
  return placed;
}
