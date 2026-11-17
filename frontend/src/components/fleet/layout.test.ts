import { describe, expect, it } from 'vitest'
import { layout } from './MoneyBlock'

describe('treemap layout', () => {
  it('gives every tile an area in proportion to its value and tiles the whole box', () => {
    const v = [50, 25, 15, 10], r = layout(v, { x: 0, y: 0, w: 100, h: 100 })
    expect(r).toHaveLength(4)
    const area = r.map((t) => t.w * t.h)
    expect(area.reduce((a, b) => a + b, 0)).toBeCloseTo(10000, 3)
    area.forEach((a, i) => expect(a / 100).toBeCloseTo(v[i], 3))
  })
  it('handles one tile and none', () => {
    expect(layout([5], { x: 0, y: 0, w: 100, h: 100 })).toEqual([{ x: 0, y: 0, w: 100, h: 100 }])
    expect(layout([], { x: 0, y: 0, w: 100, h: 100 })).toEqual([])
  })
})
