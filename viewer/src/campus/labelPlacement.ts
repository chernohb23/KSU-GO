export type Rect = { left: number; top: number; right: number; bottom: number };
export type LabelCandidate = {
  id: string; width: number; height: number; building: Rect; priority: number;
  /** Last placement relative to this building's screen center/top. */
  offset?: { x: number; y: number };
};

export function overlaps(a: Rect, b: Rect, gap = 4): boolean {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

/** Mirrors the app's 40px bubbles, pill and credit, with room for larger text. */
export function nativeLabelLayout(width: number, height: number, top = 76, left = 20, right = 20, clearance = 130) {
  return {
    viewport: { left: 20, top, right: width - 20, bottom: height - clearance + 20 },
    obstacles: [
      { left, top, right: left + 200, bottom: top + 40 },
      { left: width - right - 88, top, right: width - right, bottom: top + 40 },
      { left: width - right - 200, top: height - clearance - 48, right: width - right, bottom: height - clearance + 16 },
    ],
  };
}

/** Flags and controls are hard obstacles; only a label's own roof is a fallback. */
export function placeLabels(candidates: LabelCandidate[], obstacles: Rect[], viewport: Rect): Map<string, Rect> {
  const placed = new Map<string, Rect>();
  const library = candidates.find(label => label.id === "b-library");
  const norton = candidates.find(label => label.id === "b-norton");
  const stacked = library && norton ? [library, norton] : [];
  const units = candidates.filter(label => !stacked.includes(label)).map(label => [label]);
  if (stacked.length) units.push(stacked);
  units.sort((a, b) => Math.max(...b.map(label => label.priority)) - Math.max(...a.map(label => label.priority))
    || b.length - a.length || a[0].id.localeCompare(b[0].id));

  for (const unit of units) {
    const width = Math.max(...unit.map(label => label.width));
    const height = unit.reduce((sum, label) => sum + label.height, 0) + (unit.length - 1) * 6;
    const b = {
      left: Math.min(...unit.map(label => label.building.left)),
      top: Math.min(...unit.map(label => label.building.top)),
      right: Math.max(...unit.map(label => label.building.right)),
      bottom: Math.max(...unit.map(label => label.building.bottom)),
    };
    const center = (b.left + b.right) / 2;
    const positions: [number, number][] = [];
    for (let row = 0; row < 8; row++) {
      positions.push([center - width / 2, b.top - height - 8 - row * 26]);
    }
    for (let row = -2; row <= 4; row++) {
      positions.push([b.right + 8, b.top + row * 26], [b.left - width - 8, b.top + row * 26]);
    }
    for (let row = 0; row < 8; row++) {
      positions.push([center - width / 2, b.bottom + 8 + row * 26]);
    }
    const distance = ([x, y]: [number, number]) => Math.hypot(
      Math.max(viewport.left, Math.min(x, viewport.right - width)) + width / 2 - center,
      y + height / 2 - (b.top + b.bottom) / 2,
    );
    positions.sort((a, b) => distance(a) - distance(b));
    const first = unit[0];
    if (first.offset) {
      positions.unshift([(first.building.left + first.building.right) / 2 + first.offset.x - (width - first.width) / 2,
        first.building.top + first.offset.y]);
    }

    function tryPositions(allowOwnRoof: boolean): boolean {
      for (const [x, top] of positions) {
        // Edge buildings keep their labels inside the viewport.
        const left = Math.max(viewport.left, Math.min(x, viewport.right - width));
        let y = top;
        const rects = unit.map(label => {
          const inset = (width - label.width) / 2;
          const rect = { left: left + inset, top: y, right: left + inset + label.width, bottom: y + label.height };
          y = rect.bottom + 6;
          return rect;
        });
        const fits = rects.every((rect, index) => {
          if (rect.left < viewport.left || rect.right > viewport.right || rect.top < viewport.top || rect.bottom > viewport.bottom) return false;
          if ([...obstacles, ...placed.values()].some(other => overlaps(rect, other))) return false;
          return !candidates.some(other => (!allowOwnRoof || other.id !== unit[index].id) && overlaps(rect, other.building));
        });
        if (!fits) continue;
        unit.forEach((label, index) => placed.set(label.id, rects[index]));
        return true;
      }
      return false;
    }

    if (tryPositions(false)) continue;
    // Stay close to the building even when the only free space is on its roof.
    for (let top = b.top; top <= b.bottom; top += 6) positions.push([center - width / 2, top]);
    tryPositions(true);
  }
  return placed;
}
