import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCENARIO_BOUNDS } from '../api/bounds'
import type { Scenario } from '../api/types'
import { FIELDS, fromQuery, toQuery, validateScenario } from './scenario'
import { FIX } from '../test/utils'

const spec = JSON.parse(readFileSync(resolve(process.cwd(), '../docs/openapi.json'), 'utf8'))
const base = { ...(FIX.presets.presets[0].scenario as unknown as Scenario), battery_cost_per_kwh_inr: 12000 }
const defaultsFor = (a: string) => ({ ...(FIX.presets.presets.find((p) => p.id === a)!.scenario as unknown as Scenario), battery_cost_per_kwh_inr: 12000 })

describe('bounds follow the API', () => {
  it('has a bound for every Scenario field in the OpenAPI file', () => {
    expect(Object.keys(SCENARIO_BOUNDS).sort()).toEqual(Object.keys(spec.components.schemas.Scenario.properties).sort())
  })
  it('every Scenario field appears in the form or is a dedicated control (T5.2 field coverage)', () => {
    const shown = new Set<string>([...FIELDS.map((f) => f.key), 'archetype', 'zone', 'electricity_tariff'])
    expect([...shown].sort()).toEqual(Object.keys(spec.components.schemas.Scenario.properties).sort())
  })
  it('the default scenario passes validation', () => expect(validateScenario(base)).toEqual({}))
})

describe('validation', () => {
  it('rejects negative distance with an inline message (T5.2-2)', () => expect(validateScenario({ ...base, km_per_day: -5 }).km_per_day).toMatch(/above 0/))
  it('rejects values past the maximum', () => expect(validateScenario({ ...base, soc_max_pct: 120 }).soc_max_pct).toMatch(/at most 100/))
  it('treats an empty or NaN number as an error', () => {
    expect(validateScenario({ ...base, charge_power_kw: NaN }).charge_power_kw).toBeTruthy()
    expect(validateScenario({ ...base, km_per_day: null as unknown as number }).km_per_day).toBeTruthy()
  })
  it('keeps charger efficiency between 70 and 100 %, shown as percent', () => {
    expect(validateScenario({ ...base, charger_efficiency: 0.5 }).charger_efficiency).toMatch(/at least 70/)
    expect(validateScenario({ ...base, charger_efficiency: 1.2 }).charger_efficiency).toMatch(/at most 100/)
  })
  it('allows a missing battery price (it is optional)', () => expect(validateScenario({ ...base, battery_cost_per_kwh_inr: null })).toEqual({}))
  it('needs the charge cap at least 10 points above the minimum', () => expect(validateScenario({ ...base, soc_max_pct: 45, soc_min_pct: 40 }).soc_max_pct).toMatch(/10 points/))
  it('needs weakest-cell high not below low', () => expect(validateScenario({ ...base, pack_penalty_min: 0.1, pack_penalty_max: 0.05 }).pack_penalty_max).toBeTruthy())
  it('shows fractions as percent in messages', () => expect(validateScenario({ ...base, threshold: 0.99 }).threshold).toMatch(/below 95/))
  it('requires whole years for the forecast length', () => expect(validateScenario({ ...base, horizon_years: 7.5 }).horizon_years).toMatch(/whole/i))
})

describe('shareable link', () => {
  it('round-trips an edited scenario (T5.2-4)', () => {
    const s = { ...base, km_per_day: 175, soc_max_pct: 90, zone: 'cool' as const, charge_start_hour: 1.5 }
    const q = toQuery(s, base)
    expect(q).toContain('km_per_day=175')
    expect(q).not.toContain('pack_kwh')                      // unchanged values stay out of the link
    const back = fromQuery(`?${q}`, defaultsFor)
    expect(back.scenario).toEqual(s)
    expect(back.ignored).toEqual([])
  })
  it('falls back to defaults for a malformed link and says which values it dropped (T5.2-7)', () => {
    const r = fromQuery('?km_per_day=abc&soc_max_pct=500&zone=mars&archetype=15m', defaultsFor)
    expect(r.scenario).toEqual(defaultsFor('12m'))
    expect(r.ignored.sort()).toEqual(['archetype', 'km_per_day', 'soc_max_pct', 'zone'])
  })
  it('keeps the electricity choice and price in the link, and rejects an unknown tariff', () => {
    const s = { ...base, electricity_tariff: 'custom' as const, electricity_custom_inr_per_kwh: 8.5, charger_efficiency: 0.88 }
    const back = fromQuery(`?${toQuery(s, base)}`, defaultsFor)
    expect(back.scenario).toEqual(s)
    expect(fromQuery('?electricity_tariff=bogus', defaultsFor).ignored).toEqual(['electricity_tariff'])
    expect(toQuery(base, base)).not.toContain('electricity')  // untouched: nothing added to the link
  })
  it('uses the 9 m defaults when the link asks for them', () => expect(fromQuery('?archetype=9m', defaultsFor).scenario!.pack_kwh).toBe(250))
})
