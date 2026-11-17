import { riskSentence, thresholdInsight } from './insights'
import { describe, expect, it } from 'vitest'
import type { PredictionResult, Scenario } from '../api/types'
import { FIX } from '../test/utils'
import { anchorCost, costAtThreshold } from './costcalc'
import { staggerWindow, type DayParams } from './dayCycle'
import { leverSteps, rankLevers } from './levers'
import { fleetValue, lifeValue, rupees, valueLine } from './money'
import { binomialQuantile, bulkWindow, provision } from './planner'
import { shortfallRisk } from './routefit'

const P = FIX.predict as unknown as PredictionResult
const S = P.scenario as unknown as Scenario
const line = (slope: number, n = 121) => Array.from({ length: n }, (_, m) => 100 - m * slope)

describe('money', () => {
  it('values extra life as pack cost saved per year, and says nothing when it cannot', () => {
    expect(lifeValue(4_200_000, 144, 168)).toBeCloseTo(50_000)
    expect(lifeValue(null, 144, 168)).toBeNull()
    expect(lifeValue(4_200_000, null, 168)).toBeNull()
    expect(lifeValue(4_200_000, 144, null)).toBeNull()
    expect(lifeValue(4_200_000, 144, 120)).toBeLessThan(0)
    expect(fleetValue(9800, 50)).toBe(490_000)
  })
  it('writes rupees in lakh and crore, and the value line only when there is a value', () => {
    expect(rupees(250_000)).toBe('₹2.5 lakh'); expect(rupees(12_345_678)).toBe('₹1.23 crore'); expect(rupees(9800)).toBe('₹9,800')
    expect(valueLine(9800, 50)).toBe('about ₹9,800 per bus per year (₹4.9 lakh a year for 50 buses)')
    expect(valueLine(-9800, 1)).toContain('costs about'); expect(valueLine(0.2, 50)).toBeNull(); expect(valueLine(null, 50)).toBeNull()
  })
})

describe('planner: budget', () => {
  it('binomial quantiles are exact at the edges and ordered', () => {
    expect(binomialQuantile(100, 0.5, 0.5)).toBe(50); expect(binomialQuantile(10, 0, 0.9)).toBe(0); expect(binomialQuantile(10, 1, 0.1)).toBe(10)
    expect(binomialQuantile(1, 0.3, 0.5)).toBe(0); expect(binomialQuantile(1, 0.3, 0.9)).toBe(1)
    expect(binomialQuantile(200, 0.2, 0.1)).toBeLessThanOrEqual(binomialQuantile(200, 0.2, 0.9))
  })
  it('bulk window runs from the 10 % year to the 90 % year, and says when 90 % is not reached', () => {
    const cdf = Array.from({ length: 181 }, (_, m) => Math.min(1, m / 120))
    expect(bulkWindow(cdf)).toEqual({ from: 1, to: 9 })
    const part = cdf.map((x) => Math.min(x, 0.7))
    expect(bulkWindow(part).to).toBeNull(); expect(bulkWindow(part).from).toBe(1)
    expect(bulkWindow(cdf.map(() => 0)).from).toBeNull()
  })
  it('provision keeps low <= expected <= high and the expected total equals the share within the forecast', () => {
    const cdf = Array.from({ length: 181 }, (_, m) => Math.min(1, m / 120))
    const rows = provision(cdf, 100)
    rows.forEach((r) => { expect(r.low).toBeLessThanOrEqual(Math.ceil(r.expected)); expect(r.high).toBeGreaterThanOrEqual(Math.floor(r.expected)) })
    expect(rows.reduce((s, r) => s + r.expected, 0)).toBeCloseTo(100, 6)
  })
})

describe('routefit: shortfall risk', () => {
  const p10 = line(1 / 4), p50 = line(1 / 6), p90 = line(1 / 10)       // 300 km new, route needs 270 km = 90 % health
  it('buckets between the 10th, 50th and 90th percentile crossing years', () => {
    const at = (y: number) => shortfallRisk(300, p10, p50, p90, 270, y)
    expect(at(2).bucket).toBe('none'); expect(at(4).bucket).toBe('tenth'); expect(at(6).bucket).toBe('half'); expect(at(9).bucket).toBe('most')
    expect(at(0).years.tenth).toBeCloseTo(3.33, 1); expect(at(0).years.half).toBeCloseTo(5, 1); expect(at(0).years.most).toBeCloseTo(8.33, 1)
  })
  it('a pack that is short when new is short for every run; a curve that never crosses has no year', () => {
    expect(shortfallRisk(250, p10, p50, p90, 270, 0).bucket).toBe('all')
    const r = shortfallRisk(300, p10, p50, line(0.01), 270, 9)
    expect(r.years.most).toBeNull(); expect(r.bucket).toBe('half')
  })
})

describe('costcalc: cost at another replacement line', () => {
  const c = { p10: line(1 / 4), p50: line(1 / 6), p90: line(1 / 10) }
  it('is pack price over km to the matching curve, best case from the longest-lived curve', () => {
    const r = costAtThreshold(c, 80, 4_200_000, 200, 340)           // p50 reaches 80 % at 10 years
    expect(r.p50).toBeCloseTo(4_200_000 / (10 * 340 * 200), 6); expect(r.lifeYearsP50).toBeCloseTo(10, 6)
    expect(r.p10).toBeLessThanOrEqual(r.p50); expect(r.p50).toBeLessThanOrEqual(r.p90)
  })
  it('counts a curve that never reaches the line to the end of the forecast (an upper bound)', () => {
    const r = costAtThreshold({ ...c, p90: line(1 / 20) }, 80, 4_200_000, 200, 340)
    expect(r.p10).toBeCloseTo(4_200_000 / (10 * 340 * 200), 6); expect(r.censored).toBe(false)
    expect(costAtThreshold({ ...c, p50: line(1 / 20) }, 80, 4_200_000, 200, 340).censored).toBe(true)
  })
  it('a lower line is cheaper per km', () => {
    expect(costAtThreshold(c, 70, 4_200_000, 200, 340).p50).toBeLessThan(costAtThreshold(c, 85, 4_200_000, 200, 340).p50)
  })
})

describe('costcalc: anchoring', () => {
  it('pins the curve to the engine at the current line and leaves other points in proportion', () => {
    const at = { p10: 4, p50: 5, p90: 8 }, engine = { p10: 4, p50: 5.2, p90: 8 }
    expect(anchorCost(at, at, engine)).toEqual(engine)
    expect(anchorCost({ p10: 6, p50: 10, p90: 16 }, at, engine).p50).toBeCloseTo(10.4)
    expect(anchorCost(at, { p10: 0, p50: NaN, p90: 8 }, engine).p50).toBe(5)
  })
})

describe('dayCycle: stagger window', () => {
  const day: DayParams = { departure: 5, chargeStart: 22, chargeHours: 2, socMin: 10, socMax: 100, energyKwh: 240, packKwh: 350 }
  it('is the idle time minus the half-hour buffer, rounded down to the half hour', () => {
    const w = staggerWindow(day)
    expect(w.idleH).toBeCloseTo(5); expect(w.room).toBe(4.5); expect(w.earliest).toBe(22); expect(w.latest).toBe(2.5)
  })
  it('has no room when charging fills the night', () => { expect(staggerWindow({ ...day, chargeHours: 6.8 }).room).toBe(0) })
})

describe('levers', () => {
  const day: DayParams = { departure: S.departure_hour, chargeStart: S.charge_start_hour, chargeHours: 2, socMin: S.soc_min_pct, socMax: S.soc_max_pct, energyKwh: S.km_per_day * S.kwh_per_km, packKwh: S.pack_kwh }
  it('offers single steps for the operating levers, and route length only when asked', () => {
    const steps = leverSteps(S, day)
    expect(steps.map((s) => s.key)).toEqual(expect.arrayContaining(['soc_max_pct']))
    expect(steps.find((s) => s.key === 'soc_max_pct')!.value).toBeLessThan(S.soc_max_pct)
    expect(steps.some((s) => s.key === 'km_per_day')).toBe(false)
    expect(leverSteps(S, day, true).find((s) => s.key === 'km_per_day')!.value).toBeLessThan(S.km_per_day)
    steps.filter((s) => s.key === 'heat_rise_c').forEach((s) => expect(s.confirm).toBe(true))
  })
  it('ranks by median months gained, puts unanswered steps last, and never ranks route length', () => {
    const alt = (d: number) => { const p = structuredClone(P); (p.replacement.months_p50 as { value: number }).value += d; return p }
    const steps = leverSteps(S, day)
    const ranked = rankLevers(P, S, [{ step: steps[0], pred: alt(3) }, { step: steps[1] ?? steps[0], pred: alt(9) }, { step: steps[steps.length - 1], pred: undefined }])
    expect(ranked.map((r) => r.months)[0]).toBeGreaterThan(ranked.map((r) => r.months)[1] as number)
    expect(ranked[ranked.length - 1].months).toBeNull()
    expect(rankLevers(P, S, [{ step: { key: 'km_per_day', value: 160, text: 'x' }, pred: alt(5) }])).toEqual([])
  })
})

describe('decision sentences', () => {
  it('risk sentence names the three marks, uses day one, and never gives a made-up percentage', () => {
    expect(riskSentence({ tenth: 1.4, half: 2.7, most: 6.8 })).toBe('One bus in ten is short by year 1.4, half by year 2.7, and nine in ten by year 6.8, on this route with its 20 % reserve.')
    expect(riskSentence({ tenth: 0, half: 3, most: null })).toContain('from day one')
    expect(riskSentence({ tenth: null, half: null, most: null })).toContain('stay long enough')
  })
  it('threshold sentence covers: too little range, more than needed, already lowest, impossible', () => {
    const o = { curPct: 80, optPct: 85, hiPct: 90, needKm: 240, newKm: 280, curCost: 1, optCost: 1.62 }
    const t = thresholdInsight(o)
    expect(t.text).toContain('₹0.62 more per km'); expect(t.action).toEqual({ label: 'Try 85 %', key: 'threshold', value: 0.85 })
    expect(thresholdInsight({ ...o, curPct: 90, optPct: 85, curCost: 1.5, optCost: 1.1 }).text).toContain('saves ₹0.40 per km')
    expect(thresholdInsight({ ...o, optPct: 80 }).text).toContain('lowest line that still covers')
    expect(thresholdInsight({ ...o, optPct: null, optCost: null }).text).toContain('Even at 90 %')
  })
})
