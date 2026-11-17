import { describe, expect, it } from 'vitest'
import { DIFF_SCALE, diffRGB, healthRGB, luminance } from './colors'

describe('health colour ramp (T6.1-2)', () => {
  it('gives distinct colours at 100, 80 and 60 percent', () => {
    const c = [100, 80, 60].map((h) => healthRGB(h).join(','))
    expect(new Set(c).size).toBe(3)
  })
  it('gets steadily darker as health falls (readable in greyscale)', () => {
    let prev = Infinity
    for (let h = 100; h >= 50; h -= 2.5) { const l = luminance(healthRGB(h)); expect(l).toBeLessThanOrEqual(prev + 1e-9); prev = l }
  })
  it('hits the replacement colour exactly on the line and respects a custom line', () => {
    expect(healthRGB(80)).toEqual([249, 115, 22])
    expect(healthRGB(70, 70)).toEqual([249, 115, 22])
  })
  it('clamps outside the scale', () => { expect(healthRGB(130)).toEqual(healthRGB(100)); expect(healthRGB(0)).toEqual([239, 68, 68]) })
})

describe('difference colour scale', () => {
  const [r0, g0, b0] = diffRGB(0)
  it('is one neutral grey for no real difference', () => {
    expect(diffRGB(0.1)).toEqual(diffRGB(0)); expect(diffRGB(-0.1)).toEqual(diffRGB(0))
    expect(Math.abs(r0 - g0)).toBeLessThan(20); expect(Math.abs(g0 - b0)).toBeLessThan(20)
  })
  it('turns yellow when better and red when worse', () => {
    const [r, g, b] = diffRGB(DIFF_SCALE); expect(r).toBeGreaterThan(200); expect(g).toBeGreaterThan(180); expect(b).toBeLessThan(60)
    const [wr, wg] = diffRGB(-DIFF_SCALE); expect(wr).toBeGreaterThan(200); expect(wg).toBeLessThan(140)
  })
  it('moves steadily away from grey and stops at the end of the scale', () => {
    const dist = (d: number) => { const c = diffRGB(d); return Math.hypot(c[0] - r0, c[1] - g0, c[2] - b0) }
    expect(dist(1)).toBeLessThan(dist(2)); expect(dist(2)).toBeLessThan(dist(4)); expect(dist(-1)).toBeLessThan(dist(-3))
    expect(diffRGB(50)).toEqual(diffRGB(DIFF_SCALE)); expect(diffRGB(-50)).toEqual(diffRGB(-DIFF_SCALE))
  })
})
