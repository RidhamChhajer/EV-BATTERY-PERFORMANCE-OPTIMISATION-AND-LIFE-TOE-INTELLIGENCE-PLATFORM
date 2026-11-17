/** Battery health (percent) -> colour. Volt yellow when healthy, orange at the replacement line, red past it.
 *  Lightness falls steadily from healthy to worn, so the scale also reads in greyscale and for colour-blind viewers. */
export type RGB = [number, number, number]
const HEALTHY: RGB = [250, 204, 21], LINE: RGB = [249, 115, 22], WORN: RGB = [239, 68, 68]
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))

export function healthRGB(healthPct: number, linePct = 80): RGB {
  if (healthPct >= linePct) return mix(HEALTHY, LINE, clamp((100 - healthPct) / (100 - linePct)))
  return mix(LINE, WORN, clamp((linePct - healthPct) / 25))
}
export const healthCss = (h: number, line = 80) => `rgb(${healthRGB(h, line).join(',')})`
/** Difference view: Bus B's health minus Bus A's, in percentage points. Grey is "same as A", yellow is better, red is worse.
 *  The scale is fixed (+/- DIFF_SCALE points) so a small change looks small and a large one looks large. */
export const DIFF_SCALE = 5
const SAME: RGB = [142, 142, 152], BETTER: RGB = HEALTHY, WORSE: RGB = [248, 113, 113]
export const BASELINE_RGB = SAME
export function diffRGB(deltaPts: number, scale = DIFF_SCALE): RGB {
  if (Math.abs(deltaPts) < 0.15) return SAME
  const t = clamp(Math.abs(deltaPts) / scale)
  return mix(SAME, deltaPts > 0 ? BETTER : WORSE, 0.25 + 0.75 * t)
}
export const diffCss = (d: number, scale = DIFF_SCALE) => `rgb(${diffRGB(d, scale).join(',')})`
/** WCAG relative luminance, used by the tests to prove the ramp is monotone. */
export function luminance([r, g, b]: RGB): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** Cell temperature (deg C) -> colour for the Heat lens: cool blue, amber, hot orange-red. Lightness rises then falls, so it is not the only cue (the legend carries the numbers). */
export const TEMP_LO = 15, TEMP_HI = 45
const TEMP_STOPS: [number, RGB][] = [[15, [56, 189, 248]], [27, [226, 232, 240]], [36, [251, 146, 60]], [45, [239, 68, 68]]]
export function tempRGB(c: number): RGB {
  const t = clamp(c, TEMP_LO, TEMP_HI)
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i], [t0, c0] = TEMP_STOPS[i - 1]
    if (t <= t1) return mix(c0, c1, (t - t0) / (t1 - t0))
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1]
}
export const tempCss = (c: number) => `rgb(${tempRGB(c).join(',')})`
