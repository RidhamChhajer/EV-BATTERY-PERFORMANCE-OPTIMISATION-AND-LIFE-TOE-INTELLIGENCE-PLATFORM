import { describe, expect, it } from 'vitest'
import { shareSentence, totalCost } from './totalcost'

const band = { p10: 5, p50: 7, p90: 9 }

describe('total cost per km', () => {
  it('adds the same electricity amount to every battery percentile', () => {
    const t = totalCost(band, 14)!
    expect(t.total).toEqual({ p10: 19, p50: 21, p90: 23 })
    expect(t.electricityShare).toBeCloseTo(14 / 21)
  })
  it('is null without electricity or with a bad value', () => {
    expect(totalCost(band, null)).toBeNull()
    expect(totalCost(band, NaN)).toBeNull()
    expect(totalCost(band, -1)).toBeNull()
  })
  it('says which side is bigger, and only claims what the split shows', () => {
    expect(shareSentence(totalCost(band, 14)!)).toMatch(/Electricity is about 67 %/)
    expect(shareSentence(totalCost(band, 3)!)).toMatch(/battery is about 70 %/)
    expect(shareSentence(totalCost(band, 7)!)).toMatch(/even split/)
  })
})
