export type Rect = { left: number; top: number; right: number; bottom: number };
export type LabelCandidate = {
  id: string; width: number; height: number; anchor: { x: number; y: number }; priority: number;
  /** Last placement relative to this building's roof center. */
  offset?: { x: number; y: number };
};

export function overlaps(a: Rect, b: Rect, gap = 4): boolean {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

/** The whole native UI band is excluded, including the left pill and right credit. */
export function nativeLabelLayout(width: number, height: number, top = 76, left = 20, right = 20, clearance = 130) {
  return { viewport: {
    left: Math.max(20, left), top: Math.max(120, top + 44),
    right: width - Math.max(20, right), bottom: height - Math.max(190, clearance + 56),
  } };
}

/** Fade with zoom, reaching zero before the camera passes the zoom threshold. */
export function labelOpacity(distance: number, openingDistance: number): number {
  const t = Math.max(0, Math.min(1, (0.85 - distance / openingDistance) / 0.05));
  return t * t * (3 - 2 * t);
}

/** Try only nearby roof slots. Buildings may be covered; flags and labels may not. */
export function placeLabels(candidates: LabelCandidate[], obstacles: Rect[], viewport: Rect): Map<string, Rect> {
  const placed = new Map<string, Rect>();
  for (const candidate of [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    const { anchor, width, height } = candidate;
    const positions: [number, number][] = [
      [-width / 2, -height / 2 - 28], [-width / 2, -height / 2 + 28],
      [-width / 2 - 40, -height / 2], [-width / 2 + 40, -height / 2],
      [-width / 2, -height / 2],
    ];
    if (candidate.offset) positions.unshift([candidate.offset.x, candidate.offset.y]);
    for (const [x, y] of positions) {
      const rect = { left: anchor.x + x, top: anchor.y + y, right: anchor.x + x + width, bottom: anchor.y + y + height };
      const dx = (rect.left + rect.right) / 2 - anchor.x;
      const dy = (rect.top + rect.bottom) / 2 - anchor.y;
      if (Math.hypot(dx, dy) > 40) continue;
      if (rect.left < viewport.left || rect.right > viewport.right || rect.top < viewport.top || rect.bottom > viewport.bottom) continue;
      if ([...obstacles, ...placed.values()].some(other => overlaps(rect, other))) continue;
      placed.set(candidate.id, rect);
      break;
    }
  }
  return placed;
}
