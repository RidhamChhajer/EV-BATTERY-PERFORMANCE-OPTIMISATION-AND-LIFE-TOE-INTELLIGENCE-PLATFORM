/** Capacity left in each cell of a pack at one moment, for the 3D "capacity drains out of the cells" view.
 *  The model gives ONE health curve per bus (median, with a 10th-90th percentile spread). Individual cells are spread inside
 *  that band deterministically by cell index, so the pack looks like a pack: this is illustrative scatter bounded by the model's own
 *  range, not per-cell measurement. */
export type AgeBand = { lo: number; mid: number; hi: number }       // fractions of new capacity (0..1), p10 / p50 / p90

/** Deterministic pseudo-random in [-1, 1] from an integer. */
export function scatter(i: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0
  x = (x ^ (x >>> 13)) >>> 0
  return (x % 2001) / 1000 - 1
}

/** Fill level (0..1) of cell `i`, inside the p10-p90 band. Negative scatter pulls toward the low (weak) end. */
export function cellLevel(i: number, b: AgeBand): number {
  const u = scatter(i) * 0.85
  const v = u >= 0 ? b.mid + (b.hi - b.mid) * u : b.mid + (b.mid - b.lo) * u
  return Math.min(1, Math.max(0, v))
}

/** Capacity lost, split into the part caused by calendar ageing (sitting, heat, being full) and by cycling, as heights in a cell. */
export function lossBands(level: number, calendarShare: number) {
  const lost = Math.max(0, 1 - level), cal = lost * Math.min(1, Math.max(0, calendarShare))
  return { fill: level, calendar: cal, cycling: lost - cal }
}
