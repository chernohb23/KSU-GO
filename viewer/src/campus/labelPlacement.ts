export type Rect = { left: number; top: number; right: number; bottom: number };
export type LabelCandidate = { id: string; width: number; height: number; building: Rect; priority: number };

export function overlaps(a: Rect, b: Rect, gap = 4): boolean {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

/** Hide lower-priority labels when no clear spot remains; never cover a building or flag. */
export function placeLabels(candidates: LabelCandidate[], obstacles: Rect[], viewport: Rect): Map<string, Rect> {
  const placed = new Map<string, Rect>();
  for (const candidate of [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    const b = candidate.building;
    const width = candidate.width, height = candidate.height;
    const center = (b.left + b.right) / 2;
    const positions: [number, number][] = [
      [center - width / 2, b.top - height - 8],
      [center - width / 2, b.top - height - 32],
      [b.right + 8, b.top],
      [b.left - width - 8, b.top],
      [center - width / 2, b.bottom + 8],
    ];
    for (const [left, top] of positions) {
      const rect = { left, top, right: left + width, bottom: top + height };
      if (rect.left < viewport.left || rect.right > viewport.right || rect.top < viewport.top || rect.bottom > viewport.bottom) continue;
      if ([...obstacles, ...placed.values()].some(other => overlaps(rect, other))) continue;
      placed.set(candidate.id, rect);
      break;
    }
  }
  return placed;
}
