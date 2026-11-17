import { insightLine } from './insight'
import { describe, expect, it } from 'vitest'
import { dayShape, endSoc, phaseAt, segments, type DayParams } from './dayCycle'
import { cellLevel, lossBands, scatter } from './ageCells'
import { buildNotes, countAttention } from './notes'
import { buildSceneParams } from './sceneParams'
import { FIX } from '../test/utils'
import type { PredictionResult } from '../api/types'

// the default 12 m preset: 200 km x 1.2 kWh/km = 240 kWh from a 350 kWh pack, 120 kW charger
const day: DayParams = { departure: 5, chargeStart: 22, chargeHours: 2, socMin: 10, socMax: 100, energyKwh: 240, packKwh: 350 }

describe('dayCycle (mirrors engine day_profile)', () => {
  it('swing is 69 % and the day has drive, charge and idle in order', () => {
    expect(Math.round((1 - endSoc(day)) * 100)).toBe(69)
    expect(segments(day).map((s) => s.phase)).toEqual(['drive', 'charge', 'idle'])
  })
  it('drains while driving, fills while charging, rests full', () => {
    expect(phaseAt(5, day)).toMatchObject({ phase: 'drive', soc: 1 })
    expect(phaseAt(21.99, day).soc).toBeCloseTo(endSoc(day), 2)
    expect(phaseAt(23, day).phase).toBe('charge')
    expect(phaseAt(0.5, day)).toMatchObject({ phase: 'idle', soc: 1 })
  })
  it('flags charging that cannot finish before departure', () => {
    expect(dayShape(day).unfinished).toBe(false)
    expect(dayShape({ ...day, chargeStart: 1, chargeHours: 6 }).unfinished).toBe(true)
  })
  it('a lower cap lowers the top of the day', () => {
    expect(phaseAt(1, { ...day, socMax: 80 }).soc).toBeCloseTo(0.8)
  })
})

describe('ageCells', () => {
  const band = { lo: 0.7, mid: 0.85, hi: 0.95 }
  it('scatter is deterministic and bounded', () => {
    expect(scatter(3)).toBe(scatter(3))
    for (let i = 0; i < 200; i++) expect(Math.abs(scatter(i))).toBeLessThanOrEqual(1)
  })
  it('every cell stays inside the model band', () => {
    for (let i = 0; i < 100; i++) { const v = cellLevel(i, band); expect(v).toBeGreaterThanOrEqual(band.lo); expect(v).toBeLessThanOrEqual(band.hi) }
  })
  it('loss bands add up to what was lost', () => {
    const b = lossBands(0.85, 0.6)
    expect(b.fill + b.calendar + b.cycling).toBeCloseTo(1)
    expect(b.calendar / (b.calendar + b.cycling)).toBeCloseTo(0.6)
  })
})

describe('scene params and notes from the real fixtures', () => {
  const p = FIX.predict as unknown as PredictionResult, s = p.scenario
  it('builds plain numbers for the scene', () => {
    const sp = buildSceneParams(s, p, 4)
    expect(sp.health.lo).toBeLessThanOrEqual(sp.health.mid)
    expect(sp.health.mid).toBeLessThanOrEqual(sp.health.hi)
    expect(sp.cellTempC).toHaveLength(12)
    expect(sp.rangeKm).toBeGreaterThan(0)
    expect(sp.day.socMax).toBe(s.soc_max_pct)
  })
  it('puts range-extrapolation reasons in their own group and never invents notes', () => {
    const n = buildNotes({ a: p })
    expect(n.filter((x) => x.group === 'range').map((x) => x.text)).toEqual(p.replacement.extrapolation_reasons)
    expect(n.every((x) => x.text.length > 0)).toBe(true)
  })
  it('counts attention items and attributes Bus B ones', () => {
    const n = buildNotes({ a: p, routeTight: 'Route is tight', bGivesUpRange: 'B gives up range' })
    expect(countAttention(n)).toBeGreaterThanOrEqual(2)
    expect(n.find((x) => x.text === 'B gives up range')?.bus).toBe('B')
  })
})

describe('insightLine', () => {
  const a = { departure: 6, chargeStart: 20, chargeHours: 3, socMin: 10, socMax: 100, energyKwh: 200, packKwh: 350 }
  it('says nothing when the buses are the same and life is unchanged', () => {
    expect(insightLine({ lifeHeadline: 'No change', a, b: a, unfinishedB: false })).toBeNull()
  })
  it('reports time resting full and the change in life', () => {
    const t = insightLine({ lifeHeadline: '+4.4 months', a, b: { ...a, chargeStart: 1 }, unfinishedB: false })
    expect(t).toContain('rests at its charge cap for'); expect(t).toContain('+4.4 months')
  })
  it('flags unfinished charging', () => {
    expect(insightLine({ lifeHeadline: null, a, b: { ...a, chargeStart: 5, chargeHours: 4 }, unfinishedB: true })).toContain('does not finish charging')
    expect(insightLine({ lifeHeadline: '+14.0 months', a, b: { ...a, chargeStart: 1 }, unfinishedB: false, money: 'about ₹9,800 per bus per year (₹4.9 lakh a year for 50 buses)' })).toContain('battery life +14.0 months · about ₹9,800 per bus per year')
  })
})
