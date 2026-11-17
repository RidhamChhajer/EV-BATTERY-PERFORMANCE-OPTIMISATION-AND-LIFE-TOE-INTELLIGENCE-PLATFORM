import { describe, expect, it } from 'vitest'
import { breakEvenPrice, packCostPerYear, perThousand, priceCurve, scaleCost } from './costcalc'
import { coverage, rangeAt, routeNeedKm } from './routefit'
import { annualSchedule, cumulativeSpend, quantileDots } from './planner'
import { costInsight, healthInsight, rangeInsight, replacementInsight } from './insights'
import { diffW, lifeDelta, whatIfSpecs } from './whatif'
import { FIX } from '../test/utils'
import type { PredictionResult, Scenario } from '../api/types'

const P = FIX.predict as unknown as PredictionResult
const S = P.scenario as unknown as Scenario

describe('costcalc', () => {
  const band = { p10: 3, p50: 5, p90: 9 }
  it('scales every percentile exactly with price', () => {
    expect(scaleCost(band, 18000, 12000)).toEqual({ p10: 4.5, p50: 7.5, p90: 13.5 })
    expect(scaleCost(band, 12000, 12000)).toEqual(band)
  })
  it('finds the price that hits a target and round-trips', () => {
    const p = breakEvenPrice(12000, 5, 4)!
    expect(p).toBeCloseTo(9600)
    expect(scaleCost(band, p, 12000).p50).toBeCloseTo(4)
    expect(breakEvenPrice(12000, 0, 4)).toBeNull()
  })
  it('per-thousand and per-year helpers', () => {
    expect(perThousand(12000, 5)).toBeCloseTo(0.4167, 3)
    expect(packCostPerYear(4_200_000, 144)).toBeCloseTo(350_000)
    expect(packCostPerYear(4_200_000, null)).toBeNull()
  })
  it('curve passes through the base point', () => {
    const c = priceCurve(band, 12000, 6000, 18000, 12)
    expect(c).toHaveLength(13); expect(c[6].price).toBe(12000); expect(c[6].p50).toBeCloseTo(5)
  })
})

describe('routefit', () => {
  const ret = Array.from({ length: 181 }, (_, m) => 100 - (m / 180) * 40)   // 100 % -> 60 % over 15 years
  it('adds a 20 % reserve', () => expect(routeNeedKm(200)).toBeCloseTo(240))
  it('range at a year follows the curve', () => expect(rangeAt(300, ret, 0)).toBeCloseTo(300))
  it('reports never, until and beyond', () => {
    expect(coverage(200, ret, 240)).toEqual({ kind: 'never', year: 0 })
    const u = coverage(300, ret, 240)       // 80 % of 300 = 240 -> reached at 7.5 years
    expect(u.kind).toBe('until'); expect(u.year).toBeCloseTo(7.5, 1)
    expect(coverage(300, ret, 100).kind).toBe('beyond')
  })
})

describe('planner', () => {
  const cdf = Array.from({ length: 181 }, (_, m) => Math.min(0.8, Math.max(0, (m - 60) / 150)))   // never reaches 1: 20 % still going
  it('makes n dots and puts the unreached ones in the after-forecast bin', () => {
    const d = quantileDots(cdf, 50)
    expect(d).toHaveLength(50)
    expect(d.filter((x) => x == null).length).toBe(10)
    const reached = d.filter((x): x is number => x != null)
    expect([...reached].sort((a, b) => a - b)).toEqual(reached)
  })
  it('splits a fleet across years and keeps the total', () => {
    const { bars, after } = annualSchedule(cdf, 20)
    expect(bars).toHaveLength(15)
    expect(bars.reduce((s, b) => s + b.expected, 0) + after).toBeCloseTo(20)
    expect(after).toBeCloseTo(4)
    const spend = cumulativeSpend(bars, 1000)
    expect(spend[spend.length - 1]).toBeCloseTo(16000)
    expect(spend.every((v, i) => i === 0 || v >= spend[i - 1])).toBe(true)
  })
})

describe('whatif', () => {
  it('ignores overrides equal to the scenario and keeps real ones', () => {
    expect(diffW(S, { soc_max_pct: S.soc_max_pct, threshold: 0.7 })).toEqual({ threshold: 0.7 })
  })
  it('every slider contains the current value', () => {
    for (const s of whatIfSpecs(S)) { const cur = S[s.key as keyof Scenario]; if (typeof cur === 'number') { expect(s.min).toBeLessThanOrEqual(cur); expect(s.max).toBeGreaterThanOrEqual(cur) } }
  })
  it('life change is null when a median is missing and never quotes a null p90', () => {
    const r = P.replacement
    expect(lifeDelta(r, r)?.headline).toBe('No change')
    const none = { ...r, months_p50: null } as unknown as typeof r
    expect(lifeDelta(r, none)).toBeNull()
    expect(lifeDelta(r, r)?.range).toContain('10th percentile')
  })
})

describe('insights', () => {
  it('health: calendar-led with a high cap offers a lower cap', () => {
    const i = healthInsight({ calendarShare: 0.62, idleH: 5, capPct: 100 })
    expect(i.text).toContain('62 %'); expect(i.action?.key).toBe('soc_max_pct')
    expect(healthInsight({ calendarShare: 0.3, idleH: 0, capPct: 100 }).action).toBeUndefined()
  })
  it('replacement: handles a null late date and a null median', () => {
    expect(replacementInsight({ p10: 8.3, p50: 12.1, p90: null, within: 0.7 }).text).toContain('after the forecast')
    expect(replacementInsight({ p10: null, p50: null, p90: null, within: 0.3 }).text).toContain('no median')
  })
  it('range: never, until, beyond', () => {
    expect(rangeInsight({ need: 240, newKm: 200, median: { kind: 'never', year: 0 }, cautious: { kind: 'never', year: 0 } }).text).toContain('falls short')
    expect(rangeInsight({ need: 240, newKm: 300, median: { kind: 'until', year: 9.5 }, cautious: { kind: 'until', year: 7 } }).text).toContain('until year 9.5')
  })
  it('cost: includes the break-even sentence only with a target', () => {
    expect(costInsight({ perThousand: 0.43, topInput: 'replacement threshold', breakEven: null, target: null }).text).not.toContain('would need')
    expect(costInsight({ perThousand: 0.43, topInput: null, breakEven: 9400, target: 4 }).text).toContain('9,400')
  })
})
