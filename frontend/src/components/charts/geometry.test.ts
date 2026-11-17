import { describe, expect, it } from 'vitest'
import { band, path, X, Y, type Box } from './geometry'

const b: Box = { w: 700, h: 300, xMax: 10 }
describe('chart geometry', () => {
  it('draws the band between exactly the p90 and p10 values (T5.3-2)', () => {
    const p90 = [100, 95, 90], p10 = [100, 80, 60]
    const d = band(b, p90, p10, 30, 100)
    expect(d.startsWith(`M${X(b, 0).toFixed(1)} ${Y(b, 100, 30, 100).toFixed(1)}`)).toBe(true)
    expect(d).toContain(`L${X(b, 1 / 12).toFixed(1)} ${Y(b, 95, 30, 100).toFixed(1)}`)
    expect(d).toContain(`L${X(b, 2 / 12).toFixed(1)} ${Y(b, 60, 30, 100).toFixed(1)}`)
    expect(d.endsWith('Z')).toBe(true)
  })
  it('floors values at the chart bottom instead of drawing outside it', () => {
    const d = path(b, [100, 10], 30, 100)
    expect(d).toContain(`${Y(b, 30, 30, 100).toFixed(1)}`)
    expect(d).not.toContain(`${Y(b, 10, 30, 100).toFixed(1)}`)
  })
})
