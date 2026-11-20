/** Pure layout rules shared by the floating dock and its content clearance. */
export function dockLayout(safeBottom: number, height = 72, inset = 16, gap = 24) {
  const bottom = Math.max(0, safeBottom, inset);
  return { bottom, clearance: bottom + height + gap };
}
