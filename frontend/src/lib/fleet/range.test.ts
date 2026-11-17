import { describe, expect, it } from 'vitest'
import { busRange, inFilter, type ClassRange } from './range'

const cls = (o: Partial<ClassRange> = {}): ClassRange => ({ needKm: 250, newKm: 300, t50: 6, t10: 4, never: false, p50: Array.from({ length: 241 }, (_, i) => 100 - i * 0.1), p10: [], ...o })

describe('range cover per bus', () => {
  it('counts the years from a new pack down to the bus’s own age', () => {
    const b = busRange(cls(), 24)!                       // short at 72 months from new, the bus is 24 months old
    expect(b.months).toBe(48); expect(b.early).toBe(24); expect(b.band).toBe('y3_5')
    expect(b.needKm).toBe(250)
  })
  it('says now when the age is past the crossing, and covered when the curve never crosses', () => {
    expect(busRange(cls(), 100)!.band).toBe('now')
    expect(busRange(cls({ t50: null, t10: null }), 30)!.band).toBe('covered')
  })
  it('a class short when new is short for every bus, with no age needed; an unknown age is kept apart', () => {
    expect(busRange(cls({ never: true, newKm: 200 }), null)!.band).toBe('never')
    expect(busRange(cls(), null)!.band).toBe('unknown')
    expect(busRange(undefined, 10)).toBeUndefined()
  })
  it('the soon filter covers the first four bands only', () => {
    expect(['never', 'now', 'within_12', 'y1_3'].every((b) => inFilter(b as never, 'soon'))).toBe(true)
    expect(['y3_5', 'later', 'covered', 'unknown'].some((b) => inFilter(b as never, 'soon'))).toBe(false)
  })
})
