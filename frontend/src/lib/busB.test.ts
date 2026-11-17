import { describe, expect, it } from 'vitest'
import predict from '../test/fixtures/predict.json'
import recommend from '../test/fixtures/recommend.json'
import type { PresetResult, Scenario } from '../api/types'
import { applyOverrides, diffLevers, duplicateOf, hasChanges, leverValue, lifeChange, newWarnings, plainWarning, sameLevers, signed, sliderSpecs, stageFor } from './busB'

const A = (predict as { scenario: Scenario }).scenario
const presets = (recommend as { presets: PresetResult[] }).presets

describe('Bus B overrides', () => {
  it('an override equal to Bus A is no change', () => {
    expect(hasChanges(diffLevers(A, applyOverrides(A, { soc_max_pct: A.soc_max_pct })))).toBe(false)
  })
  it('only real differences survive and are carried to Bus B', () => {
    const b = applyOverrides(A, { soc_max_pct: 90, charge_start_hour: A.charge_start_hour })
    expect(diffLevers(A, b)).toEqual({ soc_max_pct: 90 })
    expect(b.pack_kwh).toBe(A.pack_kwh)
  })
  it('compares lever sets regardless of order', () => {
    expect(sameLevers({ soc_max_pct: 90, heat_rise_c: 1 }, { heat_rise_c: 1, soc_max_pct: 90 })).toBe(true)
    expect(sameLevers({ soc_max_pct: 90 }, { soc_max_pct: 91 })).toBe(false)
  })
  it('every slider range contains Bus A itself, even for unusual inputs', () => {
    for (const s of [A, { ...A, soc_max_pct: 50, soc_min_pct: 5, heat_rise_c: 14, kwh_per_km: 2.5, charge_power_kw: 12 }]) {
      for (const sp of sliderSpecs(s)) {
        const v = s[sp.key] as number
        expect(sp.min, sp.key).toBeLessThanOrEqual(v); expect(sp.max, sp.key).toBeGreaterThanOrEqual(v); expect(sp.step).toBeGreaterThan(0)
      }
    }
  })
})

describe('preset helpers on the real /recommend result', () => {
  it('every preset stage maps onto the Bus B levers', () => {
    for (const p of presets) for (const st of [p.charging, p.with_confirmation]) {
      if (!st) continue
      const o = diffLevers(A, st.scenario)
      expect(Object.keys(o).length).toBe(st.changes.length)
      for (const ch of st.changes) expect(o[ch.lever as keyof typeof o], ch.lever).toBeCloseTo(ch.to_value.value as number, 6)
    }
  })
  it('uses the confirmation stage only when asked and available', () => {
    const p = presets[0]
    expect(stageFor(p, false)).toBe(p.charging)
    expect(stageFor(p, true)).toBe(p.with_confirmation ?? p.charging)
  })
  it('collapses duplicates with charging only, but not when cooling makes them differ', () => {
    const dups = presets.filter((p) => duplicateOf(p, presets, false))
    expect(dups.length).toBeGreaterThan(0)
    const hot = presets.find((p) => p.id === 'hot_climate')!
    expect(duplicateOf(hot, presets, true)).toBeNull()
  })
})

describe('units sent by the API', () => {
  it('every lever unit in the real result renders without raw codes', () => {
    for (const p of presets) for (const st of [p.charging, p.with_confirmation]) for (const ch of st?.changes ?? []) {
      expect(leverValue(ch.lever, ch.to_value.value as number, ch.unit), ch.lever).not.toMatch(/degC|pct/)
    }
  })
})

describe('wording helpers', () => {
  it('signs numbers and never prints -0', () => {
    expect(signed(0.9)).toBe('+0.9'); expect(signed(-12, 0, ' km')).toBe('−12 km'); expect(signed(-0.04)).toBe('0.0')
  })
  it('summarises a change in battery life with its range', () => {
    expect(lifeChange(0.87, 0.5, 1.5)).toEqual({ headline: '+0.9 months', range: 'range +0.5 to +1.5 months' })
    expect(lifeChange(4.4, 3.4, 0, true)).toEqual({ headline: '+4.4 months', range: '10th percentile +3.4 months' })
    expect(lifeChange(0.01, -0.1, 0.1).headline).toBe('No change')
  })
  it('formats lever values in plain units', () => {
    expect(leverValue('charge_start_hour', 3, 'hour of day')).toBe('03:00')
    expect(leverValue('soc_max_pct', 95, '%')).toBe('95 %')
    expect(leverValue('heat_rise_c', 1, '°C')).toBe('1 °C')
    expect(leverValue('heat_rise_c', 3, 'degC')).toBe('3 °C')
  })
})

describe('engine warnings in plain words', () => {
  it('rewords the two known engine warnings and leaves others alone', () => {
    expect(plainWarning('Charging is not finished before departure: the bus leaves below the top of the SOC window.')).toMatch(/would not finish charging/)
    expect(plainWarning('Duty exceeds the usable pack energy per charge: add a mid-day charge, lower km/day or widen the SOC window.')).toMatch(/mid-day charge/)
    expect(plainWarning('something else')).toBe('something else')
  })
  it('only reports warnings that are new for Bus B', () => {
    expect(newWarnings(['x'], ['x', 'Charging is not finished before departure: ...'])).toHaveLength(1)
    expect(newWarnings(['x'], ['x'])).toEqual([])
  })
})
